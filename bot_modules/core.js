//core.js: Core module of the bot
//Copyright (c) 2018-2019 BlaCoiso
//This file is part of thingBot, licensed under GPL v3.0
//jshint esversion:8
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
                        return { text: helpMessage, sendDM: false };
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
            },
            {
                name: "prefix",
                description: "Show or change the prefix",
                async run(msg, args) {
                    let global = args.DB.getPrefix();
                    let guild = args.isDM ? "" : await args.wrappedDB.read("guild.prefix");
                    let defPrefix = global ? '`' + global + '`' : "mention only";
                    let curPrefix = guild ? (guild === "none" ? "mention only" : guild) : defPrefix;
                    let parsedArgs = args.getParsed();
                    let newThing = "";
                    let updatePrefix = false;
                    //TODO: Permissions and stuff; this code is disabled until perms are implemented
                    if (parsedArgs.length !== 0 && !args.isDM /*&& false*/) {
                        let argText = parsedArgs[0].text;
                        let argCmd = argText.toLowerCase();
                        let argType = parsedArgs[0].type;
                        if (argCmd === "set") {
                            if (parsedArgs.length > 1) {
                                argText = parsedArgs[1].text;
                                argCmd = argText.toLowerCase();
                                argType = parsedArgs[1].type;
                            } else return "You need to specify the new prefix.";
                        }
                        if (argCmd === "clear" || argCmd === "reset" || (global && argText === global)) {
                            updatePrefix = true;
                        } else if (argCmd === "none" || argCmd === "disable") {
                            updatePrefix = true;
                            newThing = "none";
                        } else {
                            if (argType !== "text") {
                                return "Invalid prefix.";
                            } else {
                                updatePrefix = true;
                                newThing = argText;
                            }
                        }
                        if (updatePrefix) {
                            const prefixUpdateFail = "Failed to update guild prefix";
                            try {
                                let writeRes = await args.wrappedDB.store("guild.prefix", newThing);
                                if (writeRes) {
                                    //TODO: Possibly allow changing hardcoded 30 second wait time to something else
                                    let m = await args.output("Prefix was successfully set to " +
                                        (newThing ? (newThing === "none" ? "mention only" : '`' + newThing + '`') : "default: " + defPrefix) +
                                        ". Type `undo` in the next 30 seconds to undo this change.");
                                    if (m) {
                                        let matches = await msg.channel.awaitMessages(
                                            m => m.author.id === msg.author.id && m.content.toLowerCase().startsWith("undo"),
                                            { maxMatches: 1, time: 30 * 1000 }
                                        );
                                        if (matches.size !== 0) {
                                            writeRes = await args.wrappedDB.store("guild.prefix", guild);
                                            if (writeRes) m.edit(`Prefix was successfully reverted to ${curPrefix}.`);
                                            else args.output("Failed to undo prefix change.");
                                        }
                                    }
                                }
                                else return prefixUpdateFail + '.';
                            } catch (e) {
                                this.module.logger(prefixUpdateFail, e);
                                return prefixUpdateFail + '.';
                            }
                        }
                    } else return `Default prefix: ${defPrefix}` +
                        (args.isDM ? "" : `\nCurrent prefix: ${curPrefix}`);
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