//bot.js: Main bot code
//Copyright (c) 2018-2019 BlaCoiso
//This file is part of thingBot, licensed under GPL v3.0
//jshint esversion: 6
//jshint -W083

const fs = require("fs");
const Discord = require("discord.js");
const Logger = require("./logger");
const config = require("./config.json");
const EOL = require("os").EOL;
const eventHandler = require("./eventHandler");
const DatabaseManager = require("./databaseManager");
const MAX_LOG_LINES = Number(config.maxLogLines) || 250;
const logFile = (typeof config.logFile === "string" && config.logFile ? config.logFile : "bot.log");

initLog();
const loggerCallback = function logCB(str, level) {
    if (level[1] === "WARN") console.warn(str);
    else if (level[0] >= Logger.levels.indexOf("ERROR")) console.error(str);
    else if (level[1] === "INFO") console.info(str);
    else console.log(str);
    if (logFile && !config.disableLog) fs.writeFileSync(logFile, str + EOL, { flag: 'a', encoding: "utf8" });
};
//TODO: Add some config option for the log level
const botLogger = Logger("DEBUG", loggerCallback);
const loggerWrapper = function (moduleName) {
    return function logMessage(message, level, error) {
        botLogger(message, moduleName, level, error);
    };
};
const mainLogger = loggerWrapper("BotMain");

botInit();

function initLog() {
    if (logFile) {
        if (fs.existsSync(logFile)) {
            let file = fs.readFileSync(logFile, { encoding: "utf8" });
            let nextLog = getNextOldLog();
            fs.writeFileSync(nextLog, file, { encoding: "utf8", flag: 'a' });
            fs.writeFileSync(logFile, "", { encoding: "utf8" }); //Clear old log
        }
    }
}

function getNextOldLog() {
    var i = 0;
    do {
        let logName = logFile.replace(/\.\w+$/, ext => ".old" + (i++ ? i - 1 : "") + ext);
        if (fs.existsSync(logName)) {
            let logFile = fs.readFileSync(logName, { encoding: "utf8" });
            let logLines = logFile.split("\n");
            if (logLines.length < MAX_LOG_LINES) return logName;
        } else return logName;
    } while (true); //Implicit break condition -> return
}

function botInit() {
    mainLogger("Initializing bot...");
    const Client = new Discord.Client();
    const BotDB = new DatabaseManager(config, loggerWrapper("DBManager"), loggerWrapper, Client);
    BotDB.init().then(() => {
        if (!BotDB.getToken()) {
            mainLogger("Invalid bot token", "fail");
            Client.destroy().then(() => process.abort());
        }
        eventHandler.init(Client, loggerWrapper("EventHandler"), loggerWrapper, BotDB);
        Client.on("ready", () => mainLogger("Bot is ready"));
        Client.on("error", e => mainLogger("Connection error", e));
        Client.on("disconnect", wsevent => {
            //If the WS closed with code 1000 then there was no error, 4004 means auth failed
            if (wsevent && (wsevent.code === 1000) || wsevent.code === 4004) return;
            else if (wsevent && wsevent.code === 4011) {
                mainLogger("Bot requires sharding to login", "fail");
                return;
            }
            let reconnectTime = BotDB.getReconnectTime();
            if (reconnectTime < 0) {
                mainLogger(`Connection was closed (${wsevent.code})`, "fail");
                return;
            } else mainLogger(`Connection was closed (${wsevent.code}), attempting to reconnect${reconnectTime ? " in " + reconnectTime + " seconds" : ""}...`,
                "warn");
            setTimeout(Client.login.bind(Client), reconnectTime * 1000, Client.token);
        });
        mainLogger("Logging in...");
        Client.login(BotDB.getToken())
            .then(() => mainLogger(`Logged in as ${Client.user.username}#${Client.user.discriminator} (${Client.user.id})`))
            .catch(e => mainLogger("Login failed", "fail", e));
    }).catch(e => mainLogger("Failed to initialize database", "fail", e));
}