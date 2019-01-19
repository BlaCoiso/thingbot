//jshint esversion: 6
const Discord = require("discord.js");
const moduleLoader = require("./moduleLoader");

module.exports = {
    /** @param {Discord.Client} Client */
    init(Client, logger, logWrapper, config) {
        this.client = Client;
        let moduleEvents = moduleLoader.init(logWrapper("ModuleLoader"), logWrapper, eventCallback, config);
        if (!moduleEvents) {
            logger("ModuleLoader didn't give any events to bind", "fail");
            Client.destroy().then(() => process.exit(1));
        }
        function eventCallback(events) {
            if (events) {
                if (typeof events === "string") events = [events];
                if (Array.isArray(events)) {
                    for (let event of events) {
                        if (event === "command" || event === "message") continue;
                        else if (!moduleEvents.includes(event)) return;
                        else this.bindHandler(event);
                    }
                }
            }
        }
        for (let event of moduleEvents) this.bindHandler(event);
        Client.on("message", message => {
            try {
                let botID = Client.user.id;
                if (message.author.id === botID) return;
                moduleLoader.handle("message", Client, message);
                let cmdArgs = {};
                let content = message.content;
                cmdArgs.isDM = message.channel.type === "dm";
                cmdArgs.globalPrefix = config.prefix;
                let mentionPrefix = `<@${botID}> `;
                let guildMentionPrefix = `<@!${botID}> `;
                let realPrefix = "";
                //TODO: Add per-server config and server local prefix settings
                if (config.prefix && content.startsWith(config.prefix)) realPrefix = config.prefix;
                else if (content.startsWith(mentionPrefix)) realPrefix = mentionPrefix;
                else if (content.startsWith(guildMentionPrefix)) realPrefix = guildMentionPrefix;
                else if (!cmdArgs.isDM) return;
                cmdArgs.prefix = realPrefix;
                cmdArgs.content = content.slice(realPrefix.length);
                //TODO: Add cmdArgs.cleanContent and find the offset of the beginning of the content
                if (realPrefix !== config.prefix) cmdArgs.content = cmdArgs.content.trimLeft();
                let split = cmdArgs.content.split(" ");
                let command = split.shift().trim().toLowerCase();
                if (command === "" || !moduleLoader.commandRegex.test(command)) return;
                cmdArgs.args = split.filter(arg => arg.trim() !== "");
                cmdArgs.command = command;
                cmdArgs.moduleLoader = moduleLoader;
                moduleLoader.handleCommand(command, message, cmdArgs);
            } catch (e) {
                logger("Failed to handle 'message' event", e);
            }
        });
    },
    bindHandler(event) {
        if (event === "command" || event === "message") return;
        this.client.on(event, moduleLoader.handle.bind(moduleLoader, event, this.client));
    }
};