import "./style.css";
import { fromEvent, interval, merge } from "rxjs";
import { map, filter, scan, distinctUntilChanged, } from 'rxjs/operators';

function main() {
  /**
   * References:
   * Monash FIT2102 notes on FRP: https://tgdwyer.github.io/asteroids/
   */
  const CONSTS = {
    DIAGRAM_HEIGHT: 917.563,
    DIAGRAM_WIDTH: 1115.955,
  };

  type CPUState = Readonly<{
    // Inputs:
    DIN: number,
    Run: number,
    Resetn: number,

    // Internal storage elements / wires:
    Rin: ReadonlyArray<number>,
    IRin: number,
    Ain: number,
    Gin: number,

    Rout: Array<number>,
    Gout: number,
    DINout: number,
    AddSubOut: number,

    AddSub: number,

    GPRegisters: Array<number>,
    InstructionRegister: number,
    ARegister: number,
    GRegister: number,
    Counter: number,

    Bus: number,
    Clear: number,


    // Outputs:
    Done: number,

    // General:
    regBase: number,
    irBase: number,
    initial: boolean,

    // Display:
    displayItem: string,
  }>

  const initialState: CPUState = {
    DIN: 0,
    Run: 0,
    Resetn: 0,

    // Internal storage elements / wires:
    Rin: [0, 0, 0, 0, 0, 0, 0, 0],
    IRin: 0,
    Ain: 0,
    Gin: 0,

    Rout: [0, 0, 0, 0, 0, 0, 0, 0],
    Gout: 0,
    DINout: 0,
    AddSubOut: 0,

    AddSub: 0,

    // values in registers
    GPRegisters: [0, 0, 0, 0, 0, 0, 0, 0],
    InstructionRegister: 0,
    ARegister: 0,
    GRegister: 0,
    Counter: 0,

    Bus: 0,
    Clear: 0,

    // Outputs:
    Done: 0,

    // general:
    regBase: 10,
    irBase: 8,
    initial: true,


    // item to display:
    displayItem: "",
  }

  const reduceState = (s: CPUState, e: CPUEvent) => {
    const runInput = document.getElementById("runInput") as HTMLInputElement | null;
    const run = runInput ? (runInput.checked ? 1 : 0) : 0;

    const resetnInput = document.getElementById("resetnInput") as HTMLInputElement | null;
    const resetn = resetnInput ? (resetnInput.checked ? 1 : 0) : 0;

    const registerRadixList = document.getElementById("regRadixList") as HTMLSelectElement | null;
    const registerRadixText = registerRadixList?.options[registerRadixList.selectedIndex].text;
    const registerRadix = registerRadixText === "Decimal" ? 10 :
      registerRadixText === "Octal" ? 8 :
        registerRadixText === "Hexadecimal" ? 16 :
          registerRadixText === "Binary" ? 2 : 10;

    const irRadixList = document.getElementById("irRegRadixList") as HTMLSelectElement | null;
    const irRadixText = irRadixList?.options[irRadixList.selectedIndex].text;
    const irRadix = irRadixText === "Decimal" ? 10 :
      irRadixText === "Octal" ? 8 :
        irRadixText === "Hexadecimal" ? 16 :
          irRadixText === "Binary" ? 2 : 10;

    return e instanceof Tick ? {
      ...s,
      Run: run,
      Resetn: resetn,
      regBase: registerRadix,
      irBase: irRadix,
      Clear: Number(s.Resetn || s.Done == 1)
    } :
      e instanceof Hover ? {
        ...s,
        displayItem: e.type.toString(),
      } :
        e instanceof Clock ? clockPressed(s)
          :
          e instanceof UpdateDIN ? (e.source === "DIN_input" ? updateDINfromDINInput(s) : updateDINfromInstructionInput(s)) :
            s;
  }


  const clockPressed = (s: CPUState) => {
    const opcode = s.InstructionRegister >> 6;
    const xReg = (s.InstructionRegister & 0b111_000) >> 3;
    const yReg = (s.InstructionRegister & 0b111);
    let newS = { ...s };

    // only run if run is true or current instruction is not done:
    if (!s.Run && s.Done) {
      return s;
    }

    // needed for first load of page:
    if (s.initial) {
      if (s.Run) {
        newS.initial = false;
      } else {
        return s;
      }
    }


    // update counter:
    newS.Counter = s.Done ? 0 : (s.Counter + 1) % 4;
    // newS = s.Done ? 

    // do stuff based on current instruction:
    newS.IRin = 0; newS.Done = 0; newS.Ain = 0; newS.Gin = 0; newS.AddSub = 0;
    newS.DINout = 0; newS.Rin = [0, 0, 0, 0, 0, 0, 0, 0]; newS.Rout = [0, 0, 0, 0, 0, 0, 0, 0];
    newS.Gout = 0;

    switch (s.Counter) {
      case 0:
        newS.IRin = 1;
        newS.InstructionRegister = s.DIN >> 7;
        break;
      case 1:
        switch (opcode) {
          case 0: // mv Rx Ry
            // control signals:
            newS.Rout = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => i === yReg ? 1 : 0);
            newS.Rin = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => i === xReg ? 1 : 0);
            newS.Done = 1; newS.Counter = 0;

            // logic:
            newS.GPRegisters[xReg] = s.GPRegisters[yReg];
            newS.Bus = s.GPRegisters[yReg]
            break;

          case 1: // mvi Rx _
            newS.DINout = 1;
            newS.Rin = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => i === xReg ? 1 : 0);
            newS.Done = 1; newS.Counter = 0;

            // logic:
            newS.GPRegisters[xReg] = s.DIN;
            newS.Bus = s.DIN;
            break;

          case 2: // add Rx Ry
            // control signals:
            newS.Rout = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => i === xReg ? 1 : 0);
            newS.Ain = 1;

            // logic:
            newS.ARegister = s.GPRegisters[xReg];
            newS.Bus = s.GPRegisters[xReg];
            break;

          case 3: // sub Rx Ry
            // control signals:
            newS.Rout = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => i === xReg ? 1 : 0);
            newS.Ain = 1;

            // logic:
            newS.ARegister = s.GPRegisters[xReg];
            newS.Bus = s.GPRegisters[xReg];
            break;

          default:
            break;
        }
        break;
      case 2:
        switch (opcode) {
          case 2: // add Rx Ry
            // control signals:
            newS.Rout = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => i === yReg ? 1 : 0);
            newS.Gin = 1;

            // logic:
            newS.GRegister = s.GPRegisters[yReg] + s.ARegister;
            newS.Bus = s.GPRegisters[yReg];
            newS.AddSubOut = s.GPRegisters[yReg] + s.ARegister;
            break;

          case 3: // sub Rx Ry
            // control signals:
            newS.Rout = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => i === yReg ? 1 : 0);
            newS.Gin = 1;
            newS.AddSub = 1;

            // logic:
            newS.GRegister = -s.GPRegisters[yReg] + s.ARegister;
            newS.Bus = s.GPRegisters[yReg];
            newS.AddSubOut = -s.GPRegisters[yReg] + s.ARegister;
            break;

          default:
            break;
        }
        break;
      case 3:
        switch (opcode) {
          case 2: // add Rx Ry
            // control signals:
            newS.Gout = 1;
            newS.Rin = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => i === xReg ? 1 : 0);
            newS.Done = 1;

            // logic:
            newS.GPRegisters[xReg] = s.GRegister;
            newS.Bus = s.GRegister;
            break;

          case 3: // sub Rx Ry
            // control signals:
            newS.Gout = 1;
            newS.Rin = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => i === xReg ? 1 : 0);
            newS.Done = 1;

            // logic:
            newS.GPRegisters[xReg] = s.GRegister;
            newS.Bus = s.GRegister;
            break;

          default:
            break;
        }
        break;
      default:
        break;
    }

    return newS;
  }

  const parseString = (s: string, tok: string) => {
    if (s.startsWith(tok)) {
      return s.substring(tok.length)
    } else {
      return null;
    }
  }

  // please avert your eyes this code is atrocious
  const updateDINfromInstructionInput = (s: CPUState) => {
    const DINinputElement = document.getElementById("instruction_input") as HTMLInputElement | null;
    if (!DINinputElement) {
      return s;
    }

    const instruction = DINinputElement.value;
    clearInputTextBoxes();
    const parseMv = parseString(instruction, "mv ")
    const parseMvi = parseString(instruction, "mvi ");
    const parseAdd = parseString(instruction, "add ");
    const parseSub = parseString(instruction, "sub ");

    if (parseMv) {
      // get first first register:
      for (let i = 0; i < 8; i++) {
        if (parseString(parseMv, `R${i} `)) {
          // parse the second register:
          for (let j = 0; j < 8; j++) {
            const lastBitOfInstruction = parseString(parseMv, `R${i} `);
            if (!lastBitOfInstruction) {
              alert("Unknown instruction format!");
              return s;
            }
            if (parseString(lastBitOfInstruction, `R${j}`) === "") {
              return {
                ...s,
                DIN: ((0 << 6) | (i << 3) | (j)) << 7
              }
            }
          }
        }
      }
      alert("Unknown instruction format!")
      return s;
    } else if (parseMvi) {
      // get first first register:
      for (let i = 0; i < 8; i++) {
        if (parseString(parseMvi, `R${i}`) === '') {
          return {
            ...s,
            DIN: ((1 << 6) | (i << 3)) << 7
          }
        }
      }
      alert("Unknown instruction format!")
      return s;
    } else if (parseAdd) {
      // get first first register:
      for (let i = 0; i < 8; i++) {
        if (parseString(parseAdd, `R${i} `)) {
          // parse the second register:
          for (let j = 0; j < 8; j++) {
            const lastBitOfInstruction = parseString(parseAdd, `R${i} `);
            if (!lastBitOfInstruction) {
              alert("Unknown instruction format!");
              return s;
            }
            if (parseString(lastBitOfInstruction, `R${j}`) === "") {
              return {
                ...s,
                DIN: ((2 << 6) | (i << 3) | (j)) << 7
              }
            }
          }
        }
      }
      alert("Unknown instruction format!")
      return s;
    } else if (parseSub) {
      // get first first register:
      for (let i = 0; i < 8; i++) {
        if (parseString(parseSub, `R${i} `)) {
          // parse the second register:
          for (let j = 0; j < 8; j++) {
            const lastBitOfInstruction = parseString(parseSub, `R${i} `);
            if (!lastBitOfInstruction) {
              alert("Unknown instruction format!");
              return s;
            }
            if (parseString(lastBitOfInstruction, `R${j}`) === '') {
              return {
                ...s,
                DIN: ((3 << 6) | (i << 3) | (j)) << 7
              }
            }
          }
        }
      }
      alert("Unknown instruction format!");
      return s;
    }
    alert("Unknown instruction format!")
    return s;
  }

  const clearInputTextBoxes = () => {
    const DINinputElement = document.getElementById("DIN_input") as HTMLInputElement | null;
    if (DINinputElement) {
      DINinputElement.value = "";
    }
    const IRinputElement = document.getElementById("instruction_input") as HTMLInputElement | null;
    if (IRinputElement) {
      IRinputElement.value = "";
    }
  }

  const updateDINfromDINInput = (s: CPUState) => {
    const DINinputElement = document.getElementById("DIN_input") as HTMLInputElement | null;
    if (!DINinputElement) {
      return s;
    }

    const DINinputString = DINinputElement.value;
    clearInputTextBoxes();
    // verify all digits are valid:
    const possibleDigits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F'];
    for (let i = 0; i < DINinputString.length; i++) {
      let valid = false;
      for (let j = 0; j < s.regBase; j++) {  // only allow digits from the currently selected base
        if (possibleDigits[j] == DINinputString[i]) {
          valid = true;
        }
      }
      if (!valid) {
        alert("Invalid DIN value!");
        return s;
      }
        
    }

    const newDINValue = parseInt(DINinputString, s.regBase);
    if (newDINValue == NaN) {
      alert("Invalid DIN value!");
      return s;
    }
    return {
      ...s,
      DIN: newDINValue
    }
  }


  const updateDisplay = (s: CPUState) => {
    // Update the width and height of the svg canvas according to window width
    // TODO: fix this mess but its not too important for now
    // const windowHeight = window.innerHeight+100;
    // const windowWidth = CONSTS.DIAGRAM_HEIGHT/CONSTS.DIAGRAM_WIDTH * windowHeight;
    // document.getElementById("svg_canvas")?.setAttribute("height", `${windowHeight}`)
    // document.getElementById("svg_canvas")?.setAttribute("width", `${windowWidth}`)

    // updating register contents display table:
    for (let i = 0; i < 8; i++) {
      const reg = document.getElementById(`R${i}_value`);
      if (reg) { reg.innerHTML = s.GPRegisters[i].toString(s.regBase).toUpperCase(); }
    }
    const aReg = document.getElementById("RA_value");
    if (aReg) { aReg.innerHTML = s.ARegister.toString(s.regBase).toUpperCase(); }
    const gReg = document.getElementById("RG_value");
    if (gReg) { gReg.innerHTML = s.GRegister.toString(s.regBase).toUpperCase(); }
    const irReg = document.getElementById("IR_value");
    if (irReg) { irReg.innerHTML = s.InstructionRegister.toString(s.irBase).toUpperCase(); }

    const doneWire = document.getElementById("doneWire");
    if (doneWire) {
      doneWire.setAttribute("style", `fill: none; fill-opacity: 0; stroke: rgb(${s.Done ? "0, 200" : "255, 0"}, 0); stroke-width: 2px;`)
    }
    const runWire = document.getElementById("runWire");
    if (runWire) {
      runWire.setAttribute("style", `fill: none; fill-opacity: 0; stroke: rgb(${s.Run ? "0, 200" : "255, 0"}, 0); stroke-width: 2px;`)
    }
    const resetnWire = document.getElementById("resetnWire");
    if (resetnWire) {
      resetnWire.setAttribute("style", `fill: none; fill-opacity: 0; stroke: rgb(${s.Resetn ? "0, 200" : "255, 0"}, 0); stroke-width: 2px;`)
    }
    const irInWire = document.getElementById("irInWire");
    if (irInWire) {
      irInWire.setAttribute("style", `fill: none; fill-opacity: 0; stroke: rgb(${s.IRin ? "0, 200" : "255, 0"}, 0); stroke-width: 2px;`)
    }
    const gOutWire = document.getElementById("gOutWire");
    if (gOutWire) {
      gOutWire.setAttribute("style", `fill: none; fill-opacity: 0; stroke: rgb(${s.Gout ? "0, 200" : "255, 0"}, 0); stroke-width: 2px;`)
    }
    const dinOutWire = document.getElementById("dinOutWire");
    if (dinOutWire) {
      dinOutWire.setAttribute("style", `fill: none; fill-opacity: 0; stroke: rgb(${s.DINout ? "0, 200" : "255, 0"}, 0); stroke-width: 2px;`)
    }
    const gInWire = document.getElementById("gInWire");
    if (gInWire) {
      gInWire.setAttribute("style", `fill: none; fill-opacity: 0; stroke: rgb(${s.Gin ? "0, 200" : "255, 0"}, 0); stroke-width: 2px;`)
    }
    const addsubWire = document.getElementById("addsubWire");
    if (addsubWire) {
      addsubWire.setAttribute("style", `fill: none; fill-opacity: 0; stroke: rgb(${s.AddSub ? "0, 200" : "255, 0"}, 0); stroke-width: 2px;`)
    }
    const aInWire = document.getElementById("aInWire");
    if (aInWire) {
      aInWire.setAttribute("style", `fill: none; fill-opacity: 0; stroke: rgb(${s.Ain ? "0, 200" : "255, 0"}, 0); stroke-width: 2px;`)
    }
    const clearWire = document.getElementById("clearwire");
    if (clearWire) {
      clearWire.setAttribute("style", `fill: none; fill-opacity: 0; stroke: rgb(${s.Clear ? "0, 200" : "255, 0"}, 0); stroke-width: 2px;`)
    }

    for (let i = 0; i < 8; i++) {
      const currentRinWire = document.getElementById(`R${i}inPath`);
      if (currentRinWire) {
        currentRinWire.setAttribute("style", `fine: none; fill-opacity: 0; stroke: rgb(${s.Rin[i] ? "0, 200" : "255, 0"}, 0); stroke-width: 2px`)
        // console.log("hey")
      }
    }

    // update done:
    const doneText = document.getElementById("done_text")
    if (doneText) { doneText.textContent = s.Done ? "✔️" : "❌"; }


    // update the description of whatever is hovered over:
    const hoverName = document.getElementById("hoverName");
    const hoverType = document.getElementById("hoverType");
    const hoverValue = document.getElementById("hoverValue");
    if (hoverName && hoverType && hoverValue)
      switch (s.displayItem) {
        case "controlUnit":
          hoverName.innerHTML = "Name: Control Unit\n";
          hoverType.innerHTML = "Object type: Logic Block\n";
          hoverValue.innerHTML = "";
          break;

        case "buswires":
          hoverName.innerHTML = "Name: Bus Wires\n";
          hoverType.innerHTML = "Object type: Wire (16-bits)\n";
          hoverValue.innerHTML = `Value: ${s.Bus.toString(s.regBase).toUpperCase()}`;
          break;

        case "R0":
          hoverName.innerHTML = "Name: Register 0\n";
          hoverType.innerHTML = "Object type: Register (16-bits)\n";
          hoverValue.innerHTML = `Value: ${s.GPRegisters[0].toString(s.regBase).toUpperCase()}`;
          break;

        case "R1":
          hoverName.innerHTML = "Name: Register 1\n";
          hoverType.innerHTML = "Object type: Register (16-bits)\n";
          hoverValue.innerHTML = `Value: ${s.GPRegisters[1].toString(s.regBase).toUpperCase()}`;
          break;

        case "R2":
          hoverName.innerHTML = "Name: Register 2\n";
          hoverType.innerHTML = "Object type: Register (16-bits)\n";
          hoverValue.innerHTML = `Value: ${s.GPRegisters[2].toString(s.regBase).toUpperCase()}`;
          break;

        case "R3":
          hoverName.innerHTML = "Name: Register 3\n";
          hoverType.innerHTML = "Object type: Register (16-bits)\n";
          hoverValue.innerHTML = `Value: ${s.GPRegisters[3].toString(s.regBase).toUpperCase()}`;
          break;

        case "R4":
          hoverName.innerHTML = "Name: Register 4\n";
          hoverType.innerHTML = "Object type: Register (16-bits)\n";
          hoverValue.innerHTML = `Value: ${s.GPRegisters[4].toString(s.regBase).toUpperCase()}`;
          break;

        case "R5":
          hoverName.innerHTML = "Name: Register 5\n";
          hoverType.innerHTML = "Object type: Register (16-bits)\n";
          hoverValue.innerHTML = `Value: ${s.GPRegisters[5].toString(s.regBase).toUpperCase()}`;
          break;

        case "R6":
          hoverName.innerHTML = "Name: Register 6\n";
          hoverType.innerHTML = "Object type: Register (16-bits)\n";
          hoverValue.innerHTML = `Value: ${s.GPRegisters[6].toString(s.regBase).toUpperCase()}`;
          break;

        case "R7":
          hoverName.innerHTML = "Name: Register 7\n";
          hoverType.innerHTML = "Object type: Register (16-bits)\n";
          hoverValue.innerHTML = `Value: ${s.GPRegisters[7].toString(s.regBase).toUpperCase()}`;
          break;

        case "RA":
          hoverName.innerHTML = "Name: Register A\n";
          hoverType.innerHTML = "Object type: Register (16-bits)\n";
          hoverValue.innerHTML = `Value: ${s.ARegister.toString(s.regBase).toUpperCase()}`;
          break;

        case "RG":
          hoverName.innerHTML = "Name: Register G\n";
          hoverType.innerHTML = "Object type: Register (16-bits)\n";
          hoverValue.innerHTML = `Value: ${s.GRegister.toString(s.regBase).toUpperCase()}`;
          break;

        case "IR":
          hoverName.innerHTML = "Name: Instruction Register\n";
          hoverType.innerHTML = "Object type: Register (9-bits)\n";
          hoverValue.innerHTML = `Value: ${s.InstructionRegister.toString(s.irBase).toUpperCase()}`;
          break;

        case "counter":
          hoverName.innerHTML = "Name: Counter\n";
          hoverType.innerHTML = "Object type: Register (2-bits)\n";
          hoverValue.innerHTML = `Value: ${s.Counter.toString(s.regBase).toUpperCase()}`;
          break;

        case "mux":
          hoverName.innerHTML = "Name: Multiplexer\n";
          hoverType.innerHTML = "Object type: 10 to 1 Multiplexer (16-bits)\n";
          hoverValue.innerHTML = ``;
          break;

        case "addsub":
          hoverName.innerHTML = "Name: AddSub\n";
          hoverType.innerHTML = "Object type: Adder or Subtractor (16-bits)\n";
          hoverValue.innerHTML = ``;
          break;

        case "R0in":
          hoverName.innerHTML = "Name: R0in\n";
          hoverType.innerHTML = "Object type: Wire (1-bit)\n";
          hoverValue.innerHTML = `Value: ${s.Rin[0]}`;
          break;

        case "R1in":
          hoverName.innerHTML = "Name: R1in\n";
          hoverType.innerHTML = "Object type: Wire (1-bit)\n";
          hoverValue.innerHTML = `Value: ${s.Rin[1]}`;
          break;

        case "R2in":
          hoverName.innerHTML = "Name: R2in\n";
          hoverType.innerHTML = "Object type: Wire (1-bit)\n";
          hoverValue.innerHTML = `Value: ${s.Rin[2]}`;
          break;

        case "R3in":
          hoverName.innerHTML = "Name: R3in\n";
          hoverType.innerHTML = "Object type: Wire (1-bit)\n";
          hoverValue.innerHTML = `Value: ${s.Rin[3]}`;
          break;

        case "R4in":
          hoverName.innerHTML = "Name: R4in\n";
          hoverType.innerHTML = "Object type: Wire (1-bit)\n";
          hoverValue.innerHTML = `Value: ${s.Rin[4]}`;
          break;

        case "R5in":
          hoverName.innerHTML = "Name: R5in\n";
          hoverType.innerHTML = "Object type: Wire (1-bit)\n";
          hoverValue.innerHTML = `Value: ${s.Rin[5]}`;
          break;

        case "R6in":
          hoverName.innerHTML = "Name: R6in\n";
          hoverType.innerHTML = "Object type: Wire (1-bit)\n";
          hoverValue.innerHTML = `Value: ${s.Rin[6]}`;
          break;

        case "R7in":
          hoverName.innerHTML = "Name: R7in\n";
          hoverType.innerHTML = "Object type: Wire (1-bit)\n";
          hoverValue.innerHTML = `Value: ${s.Rin[7]}`;
          break;

        case "Ain":
          hoverName.innerHTML = "Name: Ain\n";
          hoverType.innerHTML = "Object type: Wire (1-bit)\n";
          hoverValue.innerHTML = `Value: ${s.Ain}`;
          break;

        case "Gin":
          hoverName.innerHTML = "Name: Gin\n";
          hoverType.innerHTML = "Object type: Wire (1-bit)\n";
          hoverValue.innerHTML = `Value: ${s.Gin}`;
          break;

        case "IRin":
          hoverName.innerHTML = "Name: IRin\n";
          hoverType.innerHTML = "Object type: Wire (1-bit)\n";
          hoverValue.innerHTML = `Value: ${s.IRin}`;
          break;

        case "R0output":
          hoverName.innerHTML = "Name: Register 0 Output\n";
          hoverType.innerHTML = "Object type: Wire (16-bits)\n";
          hoverValue.innerHTML = `Value: ${s.GPRegisters[0].toString(s.regBase).toUpperCase()}`;
          break;

        case "R1output":
          hoverName.innerHTML = "Name: Register 1 Output\n";
          hoverType.innerHTML = "Object type: Wire (16-bits)\n";
          hoverValue.innerHTML = `Value: ${s.GPRegisters[1].toString(s.regBase).toUpperCase()}`;
          break;

        case "R2output":
          hoverName.innerHTML = "Name: Register 2 Output\n";
          hoverType.innerHTML = "Object type: Wire (16-bits)\n";
          hoverValue.innerHTML = `Value: ${s.GPRegisters[2].toString(s.regBase).toUpperCase()}`;
          break;

        case "R3output":
          hoverName.innerHTML = "Name: Register 3 Output\n";
          hoverType.innerHTML = "Object type: Wire (16-bits)\n";
          hoverValue.innerHTML = `Value: ${s.GPRegisters[3].toString(s.regBase).toUpperCase()}`;
          break;

        case "R4output":
          hoverName.innerHTML = "Name: Register 0 Output\n";
          hoverType.innerHTML = "Object type: Wire (16-bits)\n";
          hoverValue.innerHTML = `Value: ${s.GPRegisters[4].toString(s.regBase).toUpperCase()}`;
          break;

        case "R5output":
          hoverName.innerHTML = "Name: Register 5 Output\n";
          hoverType.innerHTML = "Object type: Wire (16-bits)\n";
          hoverValue.innerHTML = `Value: ${s.GPRegisters[5].toString(s.regBase).toUpperCase()}`;
          break;

        case "R6output":
          hoverName.innerHTML = "Name: Register 6 Output\n";
          hoverType.innerHTML = "Object type: Wire (16-bits)\n";
          hoverValue.innerHTML = `Value: ${s.GPRegisters[6].toString(s.regBase).toUpperCase()}`;
          break;

        case "R7output":
          hoverName.innerHTML = "Name: Register 7 Output\n";
          hoverType.innerHTML = "Object type: Wire (16-bits)\n";
          hoverValue.innerHTML = `Value: ${s.GPRegisters[7].toString(s.regBase).toUpperCase()}`;
          break;

        case "IRoutput":
          hoverName.innerHTML = "Name: Instruction register Output\n";
          hoverType.innerHTML = "Object type: Wire (9-bits)\n";
          hoverValue.innerHTML = `Value: ${s.InstructionRegister.toString(s.irBase).toUpperCase()}`;
          break;

        case "ARegOutput":
          hoverName.innerHTML = "Name: Register A Output\n";
          hoverType.innerHTML = "Object type: Wire (16-bits)\n";
          hoverValue.innerHTML = `Value: ${s.ARegister.toString(s.regBase).toUpperCase()}`;
          break;

        case "GRegOutput":
          hoverName.innerHTML = "Name: Register G Output\n";
          hoverType.innerHTML = "Object type: Wire (16-bits)\n";
          hoverValue.innerHTML = `Value: ${s.GRegister.toString(s.regBase).toUpperCase()}`;
          break;

        case "AddSubOutputWire":
          hoverName.innerHTML = "Name: AddSub Output\n";
          hoverType.innerHTML = "Object type: Wire (16-bit)\n";
          hoverValue.innerHTML = `Value: ${s.AddSubOut}`;
          break;

        case "DINoutWireGroup":
          hoverName.innerHTML = "Name: DINout\n";
          hoverType.innerHTML = "Object type: Wire (1-bit)\n";
          hoverValue.innerHTML = `Value: ${s.DINout}`;
          break;

        case "gOutWireGroup":
          hoverName.innerHTML = "Name: Gout\n";
          hoverType.innerHTML = "Object type: Wire (1-bit)\n";
          hoverValue.innerHTML = `Value: ${s.Gout}`;
          break;

        case "routWire":
          hoverName.innerHTML = "Name: Rout\n";
          hoverType.innerHTML = "Object type: Wire (8-bit)\n";
          hoverValue.innerHTML = `Value: ${s.Rout.join("")}`;
          break;

        case "doneWireG":
          hoverName.innerHTML = "Name: Done Wire\n";
          hoverType.innerHTML = "Object type: Wire (1-bit)\n";
          hoverValue.innerHTML = `Value: ${s.Done}`;
          break;

        case "clockwires":
          hoverName.innerHTML = "Name: Clock\n";
          hoverType.innerHTML = "Object type: Wire (1-bit)\n";
          hoverValue.innerHTML = ``;
          break;

        case "dinWire":
          hoverName.innerHTML = "Name: DIN\n";
          hoverType.innerHTML = "Object type: Wire (16-bit)\n";
          hoverValue.innerHTML = `Value: ${s.DIN.toString(s.regBase).toUpperCase()}`;
          break;

        case "RinGroup":
          hoverName.innerHTML = "Name: Rin\n";
          hoverType.innerHTML = "Object type: Wire (8-bit)\n";
          hoverValue.innerHTML = `Value: ${s.Rin.join("")}`;
          break;

        case "runWireGroup":
          hoverName.innerHTML = "Name: Run\n";
          hoverType.innerHTML = "Object type: Wire (1-bit)\n";
          hoverValue.innerHTML = `Value: ${s.Run}`;
          break;

        case "resetnWireGroup":
          hoverName.innerHTML = "Name: Resetn\n";
          hoverType.innerHTML = "Object type: Wire (1-bit)\n";
          hoverValue.innerHTML = `Value: ${s.Resetn}`;
          break;

        case "clearWire":
          hoverName.innerHTML = "Name: Clear\n";
          hoverType.innerHTML = "Object type: Wire (1-bit)\n";
          hoverValue.innerHTML = `Value: ${s.Clear}`;
          break;

        case "counterWire":
          hoverName.innerHTML = "Name: Counter output\n";
          hoverType.innerHTML = "Object type: Wire (2-bit)\n";
          hoverValue.innerHTML = `Value: ${s.Counter}`;
          break;

        case "upperDIN":
          hoverName.innerHTML = "Name: IR Input\n";
          hoverType.innerHTML = "Object type: Wire (9-bit)\n";
          hoverValue.innerHTML = `Value: ${(s.DIN >> 7).toString(s.irBase).toUpperCase()}`;
          break;


        default:
          break;
      }

    // update current instruction display:
    const currentInstruction = document.getElementById("currentInstruction");
    const clockCycle = document.getElementById("clockCycle");
    const opcode = s.InstructionRegister >> 6;
    const dReg = (s.InstructionRegister & 0b111_000) >> 3;
    const sReg = (s.InstructionRegister & 0b111);
    if (currentInstruction && clockCycle) {
      clockCycle.innerHTML = s.Done ? "Instruction complete!" : `Clock Cycle: ${s.Counter}`;
      switch (opcode) {
        case 0: // mv
          currentInstruction.innerHTML = `Current instruction: mv R${dReg}, R${sReg}`;
          break;

        case 1: // mvi
          currentInstruction.innerHTML = `Current instruction: mvi R${dReg}`;
          break;

        case 2: // add
          currentInstruction.innerHTML = `Current instruction: add R${dReg}, R${sReg}`;
          break;

        case 3: // add
          currentInstruction.innerHTML = `Current instruction: sub R${dReg}, R${sReg}`;
          break;

        default:
          currentInstruction.innerHTML = "unknown instruction!";
          break;
      }

    }
  }

  class Tick { };
  class Hover { constructor(public readonly type: String) { } };
  class Clock { };
  class UpdateDIN { constructor(public readonly source: string) { } };
  type CPUEvent = Tick | Hover | Clock | UpdateDIN;

  const observeMouseOver = <T>(elemId: string, result: () => T) =>
    fromEvent<MouseEvent>(document, 'mouseover').pipe(
      filter((e) => {
        const svgElem = e.target as SVGElement;
        return svgElem.parentElement == document.getElementById(elemId);
      }),
      map(result)
    )

  const observeMouseClick = <T>(elemId: string, result: () => T) =>
    fromEvent<MouseEvent>(document.getElementById(elemId) as HTMLElement, 'mousedown').pipe(
      map(result)
    )

  // const clockt$ = observeMouseClick("clock", () => "Clock clicked").subscribe(console.log);
  const clock$ = observeMouseClick("clock", () => new Clock());
  const updateDINFromInstructionInput$ = observeMouseClick("instructionInputButton", () => new UpdateDIN("instruction_input"));
  const updateDINFromDINInput$ = observeMouseClick("DINInputButton", () => new UpdateDIN("DIN_input"));

  const mouseoverControlUnit$ = observeMouseOver("controlUnit", () => new Hover("controlUnit"));
  const mouseoverBusWires$ = observeMouseOver("buswires", () => new Hover("buswires"));
  const mouseoverR0$ = observeMouseOver("R0", () => new Hover("R0"));
  const mouseoverR1$ = observeMouseOver("R1", () => new Hover("R1"));
  const mouseoverR2$ = observeMouseOver("R2", () => new Hover("R2"));
  const mouseoverR3$ = observeMouseOver("R3", () => new Hover("R3"));
  const mouseoverR4$ = observeMouseOver("R4", () => new Hover("R4"));
  const mouseoverR5$ = observeMouseOver("R5", () => new Hover("R5"));
  const mouseoverR6$ = observeMouseOver("R6", () => new Hover("R6"));
  const mouseoverR7$ = observeMouseOver("R7", () => new Hover("R7"));
  const mouseoverRA$ = observeMouseOver("RA", () => new Hover("RA"));
  const mouseoverRG$ = observeMouseOver("RG", () => new Hover("RG"));
  const mouseoverIR$ = observeMouseOver("IR", () => new Hover("IR"));
  const mouseoverCounter$ = observeMouseOver("counter", () => new Hover("counter"));
  const mouseoverMux$ = observeMouseOver("mux", () => new Hover("mux"));
  const mouseoverAddSub$ = observeMouseOver("addsub", () => new Hover("addsub"));

  const mouseoverRin0$ = observeMouseOver("R0in", () => new Hover("R0in"));
  const mouseoverRin1$ = observeMouseOver("R1in", () => new Hover("R1in"));
  const mouseoverRin2$ = observeMouseOver("R2in", () => new Hover("R2in"));
  const mouseoverRin3$ = observeMouseOver("R3in", () => new Hover("R3in"));
  const mouseoverRin4$ = observeMouseOver("R4in", () => new Hover("R4in"));
  const mouseoverRin5$ = observeMouseOver("R5in", () => new Hover("R5in"));
  const mouseoverRin6$ = observeMouseOver("R6in", () => new Hover("R6in"));
  const mouseoverRin7$ = observeMouseOver("R7in", () => new Hover("R7in"));
  const mouseoverGin$ = observeMouseOver("Gin", () => new Hover("Gin"));
  const mouseoverAin$ = observeMouseOver("Ain", () => new Hover("Ain"));
  const mouseoverIRin$ = observeMouseOver("IRin", () => new Hover("IRin"));

  const mouseoverR0Output$ = observeMouseOver("R0output", () => new Hover("R0output"));
  const mouseoverR1Output$ = observeMouseOver("R1output", () => new Hover("R1output"));
  const mouseoverR2Output$ = observeMouseOver("R2output", () => new Hover("R2output"));
  const mouseoverR3Output$ = observeMouseOver("R3output", () => new Hover("R3output"));
  const mouseoverR4Output$ = observeMouseOver("R4output", () => new Hover("R4output"));
  const mouseoverR5Output$ = observeMouseOver("R5output", () => new Hover("R5output"));
  const mouseoverR6Output$ = observeMouseOver("R6output", () => new Hover("R6output"));
  const mouseoverR7Output$ = observeMouseOver("R7output", () => new Hover("R7output"));
  const mouseoverIROutput$ = observeMouseOver("IRoutput", () => new Hover("IRoutput"));
  const mouseoverRAOutput$ = observeMouseOver("ARegOutput", () => new Hover("ARegOutput"));
  const mouseoverRGOutput$ = observeMouseOver("GRegOutput", () => new Hover("GRegOutput"));
  const mouseoverAddSubOutput$ = observeMouseOver("AddSubOutputWire", () => new Hover("AddSubOutputWire"));
  const mouseoverDINout$ = observeMouseOver("DINoutWireGroup", () => new Hover("DINoutWireGroup"));
  const mouseoverGout$ = observeMouseOver("gOutWireGroup", () => new Hover("gOutWireGroup"));
  const mouseoverRout$ = observeMouseOver("routWire", () => new Hover("routWire"));

  const mouseoverDone$ = observeMouseOver("doneWireG", () => new Hover("doneWireG"));
  const mouseoverClock$ = observeMouseOver("clockwires", () => new Hover("clockwires"));
  const mouseoverDIN$ = observeMouseOver("dinWire", () => new Hover("dinWire"));
  const mouseoverRIN$ = observeMouseOver("RinGroup", () => new Hover("RinGroup"));
  const mouseoverRun$ = observeMouseOver("runWireGroup", () => new Hover("runWireGroup"));
  const mouseoverResetn$ = observeMouseOver("resetnWireGroup", () => new Hover("resetnWireGroup"));
  const mouseoverClearWire$ = observeMouseOver("clearWire", () => new Hover("clearWire"));
  const mouseoverCounterWire$ = observeMouseOver("counterWire", () => new Hover("counterWire"));
  const mouseoverUpperDIN$ = observeMouseOver("upperDIN", () => new Hover("upperDIN"));




  const cpu$ = merge(
    interval(100).pipe(map(e => new Tick())),
    mouseoverControlUnit$, mouseoverBusWires$, mouseoverR0$, mouseoverR1$,
    mouseoverR2$, mouseoverR3$, mouseoverR4$, mouseoverR5$,
    mouseoverR6$, mouseoverR7$, mouseoverRA$, mouseoverRG$,
    mouseoverIR$, mouseoverCounter$, mouseoverMux$,
    mouseoverAddSub$, mouseoverRin0$, mouseoverRin1$,
    mouseoverRin2$, mouseoverRin3$, mouseoverRin4$, mouseoverRin5$,
    mouseoverRin6$, mouseoverRin7$, mouseoverGin$, mouseoverAin$,
    mouseoverIRin$, mouseoverR0Output$, mouseoverR1Output$, mouseoverR2Output$,
    mouseoverR3Output$, mouseoverR4Output$, mouseoverR5Output$,
    mouseoverR6Output$, mouseoverR7Output$, mouseoverIROutput$,
    mouseoverRAOutput$, mouseoverRGOutput$, mouseoverAddSubOutput$,
    mouseoverDINout$, mouseoverGout$, mouseoverRout$, mouseoverDone$,
    mouseoverClock$, mouseoverDIN$, mouseoverRIN$, mouseoverRun$,
    mouseoverResetn$, mouseoverClearWire$, mouseoverCounterWire$,
    mouseoverUpperDIN$, clock$, updateDINFromDINInput$,
    updateDINFromInstructionInput$,


  ).pipe(scan(reduceState, initialState))


  // pipe the stream of game states to return distinct game states
  // and then subscribe the stream to update the display every time the
  // state changes
  cpu$.subscribe(updateDisplay);

}

if (typeof window !== "undefined") {
  window.onload = () => {
    main();
  };
}
