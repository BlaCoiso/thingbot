//eventHandler.js: Handles bot events
//Copyright (c) 2018-2019 BlaCoiso
//This file is part of thingBot, licensed under GPL v3.0
//jshint esversion: 6
const Discord = require("discord.js");
const moduleLoader = require("./moduleLoader");
const CommandArgs = require("./commandArgs");

module.exports = {
    /** @param {Discord.Client} Client */
    init(Client, logger, logWrapper, DB) {
        this.client = Client;
        this.logger = logger;
        this.DB = DB;
        let moduleEvents = moduleLoader.init(logWrapper("ModuleLoader"), logWrapper, eventCallback, DB);
        if (!moduleEvents) {
            logger("ModuleLoader didn't give any events to bind", "fail");
            Client.destroy().then(() => process.exit(1));
        }
        const handledEvents = ["command", "message", "guildInit", "ready", "guildCreate"];
        function eventCallback(events) {
            if (events) {
                if (typeof events === "string") events = [events];
                if (Array.isArray(events)) {
                    for (let event of events) {
                        if (handledEvents.includes(event)) continue;
                        else if (!moduleEvents.includes(event)) return;
                        else this.bindHandler(event);
                    }
                }
            }
        }
        function guildInit(guild) {
            return DB.initGuildDB(guild)
                .catch(e => logger("Failed to initialize DB for guild " + guild.id, e))
                .then(() => moduleLoader.handle("guildInit", Client, DB, guild));
        }
        for (let event of moduleEvents) this.bindHandler(event);
        Client.on("ready", () => {
            let requests = [];
            Client.guilds.forEach(guild => requests.push(guildInit(guild)));
            Promise.all(requests).then(() => moduleLoader.handle("ready", Client, DB));
        });
        Client.on("guildCreate", guild => guildInit(guild)
            .then(() => moduleLoader.handle("guildCreate", Client, DB, guild)));
        Client.on("message", message => {
            try {
                if (message.author.id === Client.user.id) return;
                moduleLoader.handle("message", Client, DB, message);
                if (message.author.bot) return;
                if (message.guild) DB.read("guild.prefix", null, message.guild).then(p => this.handleCommand(message, p),
                    e => {
                        logger("Failed to fetch guild prefix, attempting to handle command without prefix", "warn", e);
                        this.handleCommand(message);
                    }).catch(e => logger("Failed to handle command", e));
                else this.handleCommand(message);
            } catch (e) {
                logger("Failed to handle 'message' event", e);
            }
        });
    },
    bindHandler(event) {
        if (event === "command" || event === "message") return;
        this.client.on(event, moduleLoader.handle.bind(moduleLoader, event, this.client, this.DB));
    },
    handleCommand(message, guildPrefix) {
        let prefix = this.detectPrefix(message, guildPrefix);
        let cmdArgs = new CommandArgs(message, this.DB, prefix, moduleLoader);
        if (!cmdArgs || !cmdArgs.command || !moduleLoader.commandRegex.test(cmdArgs.command)) return;
        moduleLoader.handleCommand(cmdArgs.command, message, cmdArgs);
    },
    detectPrefix(message, guildPrefix) {
        let content = message.content;
        let botID = message.client.user.id;
        let globalPrefix = this.DB.getPrefix();
        let mentionPrefix = `<@${botID}> `;
        let guildMentionPrefix = `<@!${botID}> `;
        if (guildPrefix && content.startsWith(guildPrefix)) return guildPrefix;
        else if (!guildPrefix && globalPrefix && content.startsWith(globalPrefix)) return globalPrefix;
        else if (content.startsWith(mentionPrefix)) return mentionPrefix;
        else if (content.startsWith(guildMentionPrefix)) return guildMentionPrefix;
        return "";
    }
};