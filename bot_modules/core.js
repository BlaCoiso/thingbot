//core.js: Core module of the bot
//Copyright (c) 2018-2019 BlaCoiso
//This file is part of thingBot, licensed under GPL v3.0
//jshint esversion:6
const BaseModule = require("../moduleBase");
class CoreModule extends BaseModule {
    constructor() {
        super();
        this.name = "Core";
        this.description = "Bot's core module";
        this.events = ["command", "ready"];
        this.commands = [
            {
                name: "help",
                description: "Gives the help message",
                usage: "[command]",
                sendDM: true,
                run(msg, args) {
                    if (args.args.length > 0 && args.args.length <= 5) {
                        let commands = args.args.map(n => args.findCommand(n)).filter((c, i, l) => c && l.indexOf(c) === i);
                        if (commands.length === 0) return { text: `Command${args.args.length === 1 ? "" : 's'} not found.`, sendDM: false };
                        let helpMessage = "";
                        for (let command of commands) {
                            helpMessage += `\`${command.name.toLowerCase()}\`: ${command.description}\n`;
                            helpMessage += `  Usage: \`${command.name.toLowerCase()}${command.usage ? ' ' + command.usage : ""}\`\n\n`;
                        }
                        return helpMessage;
                    } else {
                        let helpMessage = "List of commands: \n";
                        let commands = args.getCommands();
                        if (commands && commands.length !== 0) {
                            for (let command of commands) {
                                helpMessage += ` \`${command.name.toLowerCase()}\`: ${command.description}\n`;
                            }
                        }
                        if (!args.isDM) args.output({ text: "Help was sent to DMs.", sendDM: false });
                        return helpMessage;
                    }
                }
            },
            {
                name: "reload",
                description: "Reloads all modules",
                usage: "[moduleName]",
                reply: true,
                run(msg, args) {
                    if (this.module.DB.getOwnerList().includes(msg.author.id)) {
                        if (args.args.length === 0 || (args.args.length === 1 && args.args[0].toLowerCase() === "all")) {
                            args.reloadAll();
                            return "Reloaded all modules.";
                        } else {
                            let reloaded = [];
                            for (let modName of args.args) {
                                if (args.reloadModule(modName)) reloaded.push(modName);
                            }
                            return `Reloaded ${reloaded.length} module${reloaded.length === 1 ? '' : 's'}${reloaded.length > 0 ? " (" + reloaded.join(", ") + ")" : ""}.`;
                        }
                    } else return "You don't have permissions to use this command.";
                }
            },
            {
                name: "ping",
                description: "Checks the bot ping time",
                run(msg, args) {
                    args.output("Pinging...")
                        .then(m => m && m.edit(`Pong! Message Ping: ${m.createdTimestamp - msg.createdTimestamp}ms, ` +
                            `API Ping: ${Math.round(msg.client.ping)}ms`));
                }
            }
        ];
    }
    handle(event, client, DB, ...args) {
        if (event === "ready") {
            client.user.setPresence({ game: { name: `@${client.user.username} help` } });
        }
    }
}

module.exports = new CoreModule();