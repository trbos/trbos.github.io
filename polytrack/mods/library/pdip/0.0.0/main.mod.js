import { PolyMod, MixinType } from "../../../../PolyTypes.js";


class Stopwatch {
        constructor(modClass) {
            this.interval = null;
            this.running = false;
            this.modClass = modClass;
        }
        setTimer(q) {
            this.ui = q;
        }
        start() {
            console.log("starting")
            if (this.running) return;
            this.running = true;
            
            this.interval = setInterval(() => {
                this.modClass.timeLength++;
                this.ui ? this.ui.textContent = polyMod.formatSeconds(this.modClass.timeLength) : null;
            }, 1000);
        }
    
        stop() {
            clearInterval(this.interval);
            this.running = false;
        }
        clear() {
            this.stop();
            this.ui ? this.ui.textContent = polyMod.formatSeconds(this.modClass.timeLength) : null;
            this.modClass.timeLength = 0;
        }
    }


class pdipMod extends PolyMod { 
    pbFromServer = async function(playerId) {
        let pbJson = await fetch(`https://polydip.orangy.cfd/pb/${playerId}`).then((r) => r.json());
        return pbJson;
    };
    pbToServer = function(playerId, playerName, pbHeight) {
        fetch("https://polydip.orangy.cfd/updatepb", {
            method: "PUT",
            headers: {
                "Content-Type": "application/json"       // ← this is the key
            },
            body: JSON.stringify({ userid: playerId, username: playerName, height: pbHeight })
        });
        this.latestServerPB = pbHeight;
    };
    updateUserPB = function(newToken) {
        if (this.pbHeight >= this.floorHeights[1] && this.latestServerPB !== this.pbHeight) {
                console.log(`Conditions met! Sending pb of ${this.pbHeight} to server...`)
                this.pbToServer(this.tokenHash, this.playerName, this.pbHeight);
        };
        this.tokenHash = newToken;
        this.pbFromServer(newToken).then((r) => {
                if(r.error) {
                    console.log("No PB for user, skipping...")
                    this.pbHeight = 0;
                    this.latestServerPB = 0;
                } else {
                    console.log(`Got PB of ${r.pb} for user ${newToken}.`)
                    this.latestServerPB = parseInt(r.pb)
                    this.pbHeight = parseInt(r.pb)
                }
        });
    };
    fetchWR = async function() {
        let pbJson = await fetch("https://polydip.orangy.cfd/wr").then((r) => r.json());
        return pbJson;
    };
    checkWR = function() {
        this.fetchWR().then((r) => {
                if (this.wrHeight != parseInt(r.height)) {this.updateWRHeight(r.height)};
        });
    };
    addPlayer = function(player_id, player_name, player_height="36") {
        const arrow = document.createElement("div")
        arrow.className = "player-arrow";
        arrow.id = player_id;
        arrow.style.bottom = `${this.roundNumber(player_height)}%`;
        this.barDiv.appendChild(arrow);
    
        const playerName = document.createElement("p");
        playerName.textContent = player_name;
    
        arrow.appendChild(playerName); 
    };
    
    editPlayer = function(player_id, player_height) {
        const arrow = document.getElementById(`${player_id}`);
        arrow.style.bottom = `${this.roundNumber(player_height)}%`;
    }
    
    removePlayer = function(player_id) {
        const arrow = document.getElementById(`${player_id}`);
        arrow.remove();
    }
    
    floorPopup = function(floor_num) {
        if (this.pml.getSetting("popupSetting") === "true") {
            const color = this.popupInfo[floor_num][1]
            const desc = this.popupInfo[floor_num][0]
            
            const bar = document.getElementById("slide-bar");
            const bar2 = document.getElementById("slide-bar2");
            const bg = document.getElementById("slide-bg");
            const text = document.getElementById("slide-text");
        
            bar.classList.remove("slide-bar-anim"); 
            bar2.classList.remove("slide-bar-anim2"); 
            bg.classList.remove("slide-bg-anim");
            text.classList.remove("text-anim");     
        
            void bar.offsetWidth;
            void bar2.offsetWidth;
            void bg.offsetWidth;
            void text.offsetWidth;
            
            bar.style.setProperty("--first-color", color);
            bar.classList.add("slide-bar-anim"); 
        
            bar2.classList.add("slide-bar-anim2");
        
            bg.style.setProperty("--first-color", color);
            bg.classList.add("slide-bg-anim");
        
            text.innerHTML = `Floor${String(floor_num).padStart(2, '0')}<br>- ${desc} -`;
            text.classList.add("text-anim");   
        };
    }

    roundNumber = function(value) {
      return (Math.round((value / 2395) * 1000) / 10).toFixed(1)
    }
    
    createFloorMarkers = function() {
      this.floorHeights.forEach((height, i) => {
          const isLast = i === this.floorHeights.length - 1;
      
          if (isLast) {
                const arrow = document.createElement("div");
                arrow.className = "arrow";
                arrow.style.backgroundImage = "linear-gradient(90deg, black 25%, white 25%, white 50%, black 50%, black 75%, white 75%, white 100%), linear-gradient(0deg, black 25%, white 25%, white 50%, black 50%, black 75%, white 75%, white 100%)";
                arrow.style.backgroundSize = "30px 30px";
                arrow.style.backgroundBlendMode = "difference";
                arrow.style.bottom = `${this.roundNumber(height)}%`;
                this.barDiv.appendChild(arrow);
            
                const innerText = document.createElement("p");
                innerText.textContent = "Fin";
                innerText.style.transform = "translateX(-5px)";
            
                arrow.appendChild(innerText);
                
          } else {
              this.createArrow("gray", `${this.roundNumber(height)}%`, `${i}`);
          }
      });
    };

    createFloorPopupUI = function(uiDiv) {
      
      const topDiv = document.createElement("div");
      topDiv.className = "popup-div"
      topDiv.id = "popupDiv"
  
      uiDiv.appendChild(topDiv); 
  
      const topDivStyle = document.createElement("style");
      topDivStyle.textContent = `
      .popup-div {
          position: absolute;
          top: 0px;
          height: 80px;
          width: 500px;
          left: calc(50% - 250px);
          overflow: hidden; 
          color: white;
          display: flex;
          justify-content: center;
          text-align: center;
          align-items: center;
          font-size: 32px;
      }
  
      @keyframes floorSlide1 {
          0% {
              transform: translateX(-100%);
              background: var(--first-color);
              opacity: 1;
              z-index: 1;
          }
          33.2% {
              transform: translateX(0%);
              background: var(--first-color);
              opacity: 1;
              z-index: 1;
          }
          66.6% {
              transform: translateX(0%);
              background: var(--first-color);
              opacity: 1;
              z-index: 1;
          }
          66.7% {
              transform: translateX(0%);
              background: var(--first-color);
              opacity: 0;
              z-index: 1;
          }
          100% {
              transform: translateX(-100%);
              background: var(--first-color);
              opacity: 0;
              z-index: 1;
          }
      }
  
      @keyframes floorSlide2 {
          0% {
              transform: translateX(-100%);
              background: white;
              opacity: 0;
              z-index: 2;
          }
          33.3% {
              transform: translateX(-100%);
              background: white;
              opacity: 1;
              z-index: 2;
          }
          66.6% {
              transform: translateX(0%);
              background: white;
              opacity: 1;
              z-index: 2;
          }
          99.9% {
              transform: translateX(100%);
              background: white;
              opacity: 1;
              z-index: 2;
          }
          100% {
              transform: translateX(-100%);
              opacity: 0;
              z-index: 2;
          }
      }
  
      @keyframes bgSlide {
          0% {
              opacity: 0;
          }
          11% {
              opacity: 0;
          }
          11.1% {
              background: var(--first-color);
              opacity: 0.5;
          }
          90% {
              background: var(--first-color);
              opacity: 0.5;
          }
          100% {
              background: var(--first-color);
              opacity: 0;
          }
      }
      @keyframes text {
          0% {
              opacity: 0;
          }
          11% {
              opacity: 0;
          }
          11.1% {
              opacity: 1;
          }
          90% {
              opacity: 1;
          }
          100% {
              opacity: 0;
          }
      }
  
      .slide-bar {
          position: absolute;
          width: 100%;
          height: 100%;
          transform: translateX(-100%); 
      }
  
      .slide-bar-anim {
          animation: floorSlide1 1s forwards;
      }
      .slide-bar-anim2 {
          animation: floorSlide2 1s forwards;
      }
      .slide-bg-anim {
          animation: bgSlide 6s forwards;
      }
      .text-anim {
          animation: text 6s forwards;
      }
  
      .slide-bg {
          position: absolute;
          width: 100%;
          height: 100%;
      }
      `;
  
      document.head.appendChild(topDivStyle);
  
      const bar1 = document.createElement("div");
      bar1.className = "slide-bar";
      bar1.id = "slide-bar"
  
      topDiv.appendChild(bar1);
  
      const bar2 = document.createElement("div");
      bar2.className = "slide-bar";
      bar2.id = "slide-bar2";
  
      topDiv.appendChild(bar2);
  
      const bg = document.createElement("div");
      bg.className = "slide-bg";
      bg.id = "slide-bg";
  
      topDiv.appendChild(bg);
  
      const text = document.createElement("p");
      text.style.position = "absolute";
      text.style.zIndex = "1";
      text.style.opacity = "0";
      text.id = "slide-text";
      
      topDiv.appendChild(text);
  };

    createPolyDipUI = function(pb, player_name, timer_value="0") {
    
        this.polyDipEnabled = true;
    
        
        const uiDiv = document.getElementById("ui");
    
        const leftDiv = document.createElement("div");
        leftDiv.className = "leftDiv";
        leftDiv.id = "leftDiv";
        leftDiv.style.position = "absolute";
        leftDiv.style.left = "0";
        leftDiv.style.height = "100%";
    
        uiDiv.appendChild(leftDiv);
    
        
        this.createFloorPopupUI(uiDiv);
    
        
        this.barDiv = document.createElement("div");
    
        if (this.pml.getSetting("barSetting") === "false") {this.barDiv.style.opacity = "0"};
        
        const bar = document.createElement("div");
        bar.className = "height-bar";
        this.barDiv.className = "height-bar-div";
    
        leftDiv.appendChild(this.barDiv);
        this.barDiv.appendChild(bar);
    
        this.playerArrow = document.createElement("div");
        this.playerArrow.className = "player-arrow";
        this.playerArrow.style.bottom = "1.5%";
        this.barDiv.appendChild(this.playerArrow);
    
        const playerName = document.createElement("p");
        playerName.textContent = player_name;
    
        this.playerArrow.appendChild(playerName);
    
        const textDiv = document.createElement("div");
        textDiv.className = "pd-text-div";
    
        leftDiv.appendChild(textDiv);
    
        this.heightText = document.createElement("p");
        this.heightText.textContent = "Height: 35m (1.5%)";
        this.heightText.style.textShadow = "-2px -2px 0 black, 2px -2px 0 black, -2px 2px 0 black, 2px 2px 0 black, 0px 0px 5px black";
        
        this.pbText = document.createElement("p");
        this.pbText.textContent = `PB: ${this.pbHeight}m`;
        this.pbText.style.textShadow = "-2px -2px 0 black, 2px -2px 0 black, -2px 2px 0 black, 2px 2px 0 black, 0px 0px 5px black";
    
        textDiv.appendChild(this.heightText);
        textDiv.appendChild(this.pbText);
    
        this.pbArrow = document.createElement("div");
        this.pbArrow.className = "arrow";
        this.pbArrow.style.background = "#00b8be";
        this.pbArrow.style.bottom = `${this.roundNumber(pb)}%`;
        this.pbArrow.style.zIndex = "1";
        this.barDiv.appendChild(this.pbArrow);
    
        const pbinnerText = document.createElement("p");
        pbinnerText.textContent = "PB";
        pbinnerText.style.transform = "translateX(-5px)";
    
        this.pbArrow.appendChild(pbinnerText);

        this.wrArrow = document.createElement("div");
        this.wrArrow.className = "arrow";
        this.wrArrow.style.background = "gold";
        this.wrArrow.style.bottom = `${this.roundNumber(this.wrHeight)}%`;
        this.wrArrow.style.zIndex = "1";
        this.barDiv.appendChild(this.wrArrow);
    
        const wrinnerText = document.createElement("p");
        wrinnerText.textContent = "WR";
        wrinnerText.style.transform = "translateX(-5px)";
    
        this.wrArrow.appendChild(wrinnerText);
    
        const barStyle = document.createElement('style');
        barStyle.textContent = `
        .height-bar {
            background: white;
            height: 100%;
            margin: 20px 50px;
            width: 10px;
            bottom: 0;
            position: absolute;
            outline: solid;
            outline-width: 4px;
        }`;
    
        const barDivStyle = document.createElement("style");
        barDivStyle.textContent = `
        .height-bar-div {
            position: absolute;
            bottom: 0;
            height: 80%;
            width: 100%;
        }
        `;
    
        const textDivStyle = document.createElement("style");
        textDivStyle.textContent = `
        .pd-text-div {
    
            color: white;
            margin: 90px 120px;
            font-size: 32px;
        }
        `;
    
        document.head.appendChild(barStyle);
        document.head.appendChild(barDivStyle);
        document.head.appendChild(textDivStyle);
    
        this.createFloorMarkers();
    
        this.greenTimer = document.createElement("div");
        this.greenTimer.className = "green-timer";
        this.greenTimer.id = "green-timer";
    
        if (this.pml.getSetting("timerSetting") === "false") {this.greenTimer.style.opacity = "0"};
    
        uiDiv.appendChild(this.greenTimer);

        const timer = document.createElement("p");
        timer.textContent = this.formatSeconds(this.timeLength);
        this.stopWatch.setTimer(timer);

        this.greenTimer.appendChild(timer);   
    
        const timerDivStyle = document.createElement("style");
        timerDivStyle.textContent = `
        .green-timer {
            opacity: 0.5;
            background: black;
            height: 100px;
            width: 220px;
            position: absolute;
            right: 0;
            bottom: 50%;
            color: #00ff00;
            text-align: right;
            font-size: 80px;
            display: flex;
            align-items: center;
            justify-content: right;
            padding: 0 70px;
        }
        `;
    
        document.head.appendChild(timerDivStyle);
    };

    updateWRHeight = function(value) {
        this.wrHeight = value;
        this.wrArrow.style.bottom = `${this.roundNumber(value)}%`;
    };

    checkFloor = function(heightIndex, playerPos) {
        if (!this.canCallFloor) return;
        if (heightIndex == 16 || heightIndex == 0) return;
        const floorX = this.floorXZ[heightIndex][0];
        const floorZ = this.floorXZ[heightIndex][1];
        if (playerPos.x < floorX || playerPos.x > floorX + 40) {console.log(`x check failed for floor ${heightIndex} hitbox`);return;};
        if (playerPos.z < floorZ || playerPos.z > floorZ + 40) {console.log(`z check failed for floor ${heightIndex} hitbox`);return;};
        this.canCallFloor = false;

        console.log(`Floor Popup Called for floor ${heightIndex}`)
        this.floorPopup(heightIndex);
            
        setTimeout(() => {
            this.canCallFloor = true;
        }, 30000);            
    };

    updateHeight = function(value) {
        this.playerHeightNow = value;
        const heightPercent = this.roundNumber(value);
        const roundValue = Math.round(value)
        this.heightText.textContent = `Height: ${roundValue}m (${heightPercent}%)`;
        this.playerArrow.style.bottom = `${heightPercent}%`;   
        if (this.pbHeight < roundValue) {this.updatePbHeight(roundValue)};
    };
    
    updatePbHeight = function(value) {
        this.pbHeight = value;
        this.pbText.textContent = `PB: ${value}m`;
        this.pbArrow.style.bottom = `${this.roundNumber(value)}%`;
        if (!this.isInPB) {this.rainbowPB(value);this.isInPB = true;};
    };
    
    createArrow = function(bg_color, height, inner_text, z_index="auto") {
        const arrow = document.createElement("div");
        arrow.className = "arrow";
        arrow.style.background = bg_color;
        arrow.style.bottom = height;
        arrow.style.zIndex = z_index;
        this.barDiv.appendChild(arrow);
    
        const innerText = document.createElement("p");
        innerText.textContent = inner_text;
        innerText.style.transform = "translateX(-5px)";
    
        arrow.appendChild(innerText);
    };
    formatSeconds(seconds) {
        const d = Math.floor(seconds / 86400);
        const h = Math.floor((seconds % 86400) / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
    
        if (d > 0) return `${d}:${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        if (m > 0) return `${m}:${String(s).padStart(2, '0')}`;
        return `${s}`;
    };
    removePolyDipUI = function() {
        if(this.polyDipEnabled) {
            this.polyDipEnabled = false;
            this.canCallFloor = true;
            this.stopWatch.stop();
            document.getElementById("leftDiv").remove();
            document.getElementById("popupDiv").remove();
            document.getElementById("green-timer").remove();
            if (this.rainbowDiv) {this.rainbowDiv.remove()};
        }
    };
    rainbowPB = function(height) {
        const pbText = `NEW PB ${height} m`
        const uicont = document.getElementById("ui");
        this.rainbowDiv = document.createElement("div");
        this.rainbowDiv.style.position = "absolute";
        this.rainbowDiv.style.top = "25%";
        this.rainbowDiv.style.left = "calc(50% - 275px)";
        this.rainbowDiv.style.fontSize = "80px";
        this.rainbowDiv.style.fontWeight = "bold";
        this.rainbowDiv.style.width = "550px";
        this.rainbowDiv.style.gap = "2px";
        this.rainbowDiv.style.letterSpacing = "2px";
        uicont.appendChild(this.rainbowDiv);
    
        const letters = pbText.split("").map((char, i) => {
            const span = document.createElement("span");
            span.textContent = char === " " ? "\u00A0" : char;
            span.style.display = "inline-block";
            this.rainbowDiv.appendChild(span);
            return span;
        });
    
        let t = 0;
        let animationId;
        
        function animate() {
          t += 0.1;
          letters.forEach((letter, i) => {
            const offset = Math.sin(t + i * 0.3) * 20;
            letter.style.transform = `translateY(${offset}px)`;
        
            const hue = (t * 40 + i * 20) % 360;
            letter.style.color = `hsl(${hue}, 100%, 50%)`;
          });
        
          animationId = requestAnimationFrame(animate);
        }
        
        animate();
        
        // 7 sec
        setTimeout(() => {
            this.rainbowDiv.classList.add("fade-text")
        }, 6500);
        
        setTimeout(() => {
            cancelAnimationFrame(animationId);
            this.rainbowDiv.remove()
            this.rainbowDiv = null;
        }, 8000);
    };
  init = function(polyModLoader) {
    this.pml = polyModLoader;
    //define variables
    this.heightText;
    this.pbText;
    this.barDiv;
    this.pbArrow;
    this.wrArrow;
    this.playerArrow;
    this.floorHeights = [35, 105, 245, 365, 500, 645, 770, 885, 1025, 1150, 1295, 1425, 1580, 1720, 1855, 1990, 2110, 2395];
    this.floorXZ = [[NaN, NaN], [650, -30], [370, 210], [130, -70], [410, -310], [650, 10], [170, 170], [130, -70], [370, -310], [650, 10], [410, 210], [130, -70], [390, -270], [650, -70], [370, 210], [130, -30], [410, -310], [NaN, NaN]]
    this.popupInfo = [["Cold Beginning", "#5DE2E7"],["xddlent", "#FFECA1"],["Summer Slide", "#FFCC00"],["You're Skewed", "#FFFFFF"],["Thawing Temple", "#E75480"],["The Knot", "#7DDA58"],["The Sponge", "#060270"],["Koopa Troopa", "#b9f2ff"],["Strawberry Cheesecake", "#8b0000"],["Ice Gold", "#FE9900"],["Missing Pieces", "#020202"],["Paarse Ramp", "#CC6CE7"],["Iolites Trace", "#FFB6C1"],["Spider Sense", "#013220"],["Scared of Dragons?", "#CECECE"],["On the Edge", "#FD7C79"]];
    this.greenTimer;
    this.timeLength = 0;
    this.stopWatch = new Stopwatch(this);
    this.playerSimHeight = 35;
    this.polyDipEnabled = false;
    this.trackId;
    this.playerName = "Anonymous";
    this.tokenHash = "0";
    this.pbHeight = 35;
    this.canCallFloor = true;
    this.canUploadPB = true;
    this.wrHeight;
    this.isInPB = false;
    this.lastRecordedHeight = 0;
    this.playerHeightNow;
    this.rainbowDiv = null;

    this.pbFromServer("test").then((r) => console.log(r));

      //SETTINGS BOOLS

    polyModLoader.registerSettingCategory("PolyDip Mod");
    polyModLoader.registerSetting("Show Side Bar", "barSetting", "boolean", true);
    polyModLoader.registerSetting("Show Floor Number Popup", "popupSetting", "boolean", true);
    polyModLoader.registerSetting("Green timer", "timerSetting", "boolean", true);

    polyModLoader.registerBindCategory("PolyDip Mod Green Timer");
    polyModLoader.registerKeybind("Start/stop timer", "pDipStartTimer", "keydown","KeyU", null, (e) => {if(this.polyDipEnabled) {e.preventDefault();this.stopWatch.running ? this.stopWatch.stop() : this.stopWatch.start()}})
    polyModLoader.registerKeybind("Reset timer", "pDipResetTimer", "keydown","Digit0", null, (e) => {if(this.polyDipEnabled) {e.preventDefault();this.stopWatch.clear();}})

    //FUNCTIONS
    const fadeOut = document.createElement("style");
    fadeOut.textContent = `
       @keyframes fade {
            0% {
                opacity: 1;
            }
            100% {
                opacity: 0;
            }
        }
    
        .fade-text {
            animation: fade 1s forwards;
        }
    `
    document.head.appendChild(fadeOut);
    
    
    const hideUI = function(id) {
        document.getElementById(id).style.opacity = "0";
    }
    const showUI = function(id, opacity="1") {
        document.getElementById(id).style.opacity = opacity;
    }

    const arrowStyle = document.createElement("style");
    arrowStyle.textContent = `
    .arrow {
        background: #192042;
        width: 50px;
        height: 30px;
        margin: 5px 0;
        position: absolute;
        bottom: 0%;
        clip-path: polygon(0% 0%, calc(100% - 20px) 0%, 100% 50%, calc(100% - 20px) 100%, 0% 100%);
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        text-shadow: -1px -1px 0 black, 1px -1px 0 black, -1px 1px 0 black, 1px 1px 0 black, 0px 0px 2px black;
    }`;
    
    const playerArrowStyle = document.createElement("style");
    playerArrowStyle.textContent = `
    .player-arrow {
        display: flex;
        bottom: 0%;
        margin: 5px 60px;
        clip-path: polygon(100% 0%, 20px 0%, 0% 50%, 20px 100%, 100% 100%);
        color: white;
        align-items: center;
        justify-content: center;
        padding: 0 25px 0 40px;
        background: #192042;
        height: 30px;
        position: absolute;
        text-shadow: -1px -1px 0 black, 1px -1px 0 black, -1px 1px 0 black, 1px 1px 0 black, 0px 0px 2px black;
    }
    `;
    
    document.head.appendChild(playerArrowStyle);
    document.head.appendChild(arrowStyle);

    //MIXINS

    //keep track of what trackid the current track is (check if the track is polydip)
    polyModLoader.registerFuncMixin("UR", MixinType.INSERT, `{`, `ActivePolyModLoader.getMod("pdip").trackId = OR(this, TR, "f");console.log(OR(this, TR, "f"));`)

    //main ui from here
    polyModLoader.registerFuncMixin("dP", MixinType.INSERT, 'if (e) {', `
        const modInst = ActivePolyModLoader.getMod("pdip");
        if(modInst.trackId == "8cbcb138be4608cbc2b12f956dfadcf66ebfcf013788f0f34abc2603909fde50"){
            modInst.timeLength = localStorage.getItem(\`pdip_timer_\${modInst.tokenHash}\`) ?? 0;
            modInst.createPolyDipUI(modInst.pbHeight, modInst.playerName, 0);
        };
    `);

    polyModLoader.registerClassMixin("mL.prototype", "getCurrentUserProfile", MixinType.INSERT, '{', 'ActivePolyModLoader.getMod("pdip").playerName = fL(this, hL, "f").nickname;ActivePolyModLoader.getMod("pdip").tokenHash = fL(this, hL, "f").tokenHash;');
    polyModLoader.registerClassMixin("mL.prototype", "setProfileSlot", MixinType.INSERT, 'pL(this, hL, fL(this, sL, "m", uL).call(this, fL(this, cL, "f")), "f"),', 'ActivePolyModLoader.getMod("pdip").updateUserPB(fL(this, hL, "f").tokenHash),');

    this.car = null;
    this.spectator = null;
    polyModLoader.registerFuncMixin("pP", MixinType.INSERT, `yP(this, eP, "f").setColors(n.carColors),`, `ActivePolyModLoader.getMod("${this.modID}").car = yP(this, eP, "f"),`);
    polyModLoader.registerFuncMixin("uP", MixinType.INSERT, `var e;`, `ActivePolyModLoader.getMod("pdip").isInPB = false;`);
    polyModLoader.registerClassMixin("s_.prototype", "addToggleListener", MixinType.INSERT, `a_(this, QT, "f").push(e)`, `,ActivePolyModLoader.getMod("${this.modID}").spectator = this;`);
    polyModLoader.registerFuncMixin("polyInitFunction", MixinType.INSERT, `y.setAnimationLoop((function(e) {`, `ActivePolyModLoader.getMod("pdip").update();`);
    polyModLoader.registerClassMixin("pk.prototype", "dispose", MixinType.INSERT, `{`, `
    const modInst = ActivePolyModLoader.getMod("pdip");
    if (modInst.polyDipEnabled) {
        modInst.removePolyDipUI();

        localStorage.setItem(\`pdip_timer_\${modInst.tokenHash}\`, modInst.timeLength);
    }`);
      
    }
    update = function() {
        if (this.polyDipEnabled) {
                if(this.car) {
                    const carPos = this.car.getPosition();
                    this.updateHeight(this.car ? carPos.y : 35);
                    const heightIndex = this.floorHeights.indexOf(Math.round(carPos.y));
                    if (heightIndex !== -1) {this.checkFloor(heightIndex, carPos)};
                }
        }
    }
    postInit = () => {
        if(this.tokenHash !== "0") {
            this.pbFromServer(this.tokenHash).then((r) => {
                if(r.error) {
                    console.log("No PB for user, skipping...")
                    this.latestServerPB = 0;
                } else {
                    console.log(`Got PB of ${r.pb} for user ${this.tokenHash}.`)
                    this.latestServerPB = parseInt(r.pb)
                    this.pbHeight = parseInt(r.pb)
                }
            });
            this.fetchWR().then((b) => {
                if(b.error) {
                    console.log("Error Fetching WR")
                    this.wrHeight = 0;
                } else {
                    console.log(`WR of ${b.height}.`)
                    this.wrHeight = parseInt(b.height)
                }
            });
        }
        this.pbSyncInterval = setInterval(() => {
            if(this.pbHeight >= this.floorHeights[1] && this.latestServerPB !== this.pbHeight) {
                console.log(`Conditions met! Sending pb of ${this.pbHeight} to server...`)
                this.pbToServer(this.tokenHash, this.playerName, this.pbHeight);
            };
            if (this.isInPB && this.playerHeightNow - this.lastRecordedHeight < -60) {
                this.isInPB = false;
            };
            this.lastRecordedHeight = this.playerHeightNow;
        }, 5000)
    };
}

export let polyMod = new pdipMod();
