//core.js: Core module of the bot
//Copyright (c) 2018-2019 BlaCoiso
//This file is part of thingBot, licensed under GPL v3.0
//jshint esversion:8
const BaseModule = require("../moduleBase");
const inspect = require("util").inspect;
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
                perms: "bot_owner",
                reply: true,
                run(msg, args) {
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
                usage: "[prefix]",
                async run(msg, args) {
                    let global = args.DB.getPrefix();
                    let guild = args.isDM ? "" : await args.wrappedDB.read("guild.prefix");
                    let defPrefix = global ? '`' + global + '`' : "mention only";
                    let curPrefix = guild ? (guild === "none" ? "mention only" : '`' + guild + '`') : defPrefix;
                    let parsedArgs = args.getParsed();
                    let newThing = "";
                    if (parsedArgs.length !== 0 && !args.isDM && args.checkPerms(["bot_owner", "server"])) {
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
                        } else if (argCmd === "none" || argCmd === "disable") newThing = "none";
                        else {
                            if (argType !== "text") return "Invalid prefix.";
                            else newThing = argText;
                        }
                        if (newThing === guild) return `The current prefix already is ${curPrefix}.`;
                        else {
                            const prefixUpdateFail = "Failed to update guild prefix";
                            try {
                                let writeRes = await args.wrappedDB.store("guild.prefix", newThing);
                                if (writeRes) {
                                    //TODO: Possibly allow changing hardcoded 30 second wait time to something else
                                    let setMsg = `Prefix was successfully set to ${newThing ?
                                        (newThing === "none" ? "mention only" : '`' + newThing + '`') : "default: " + defPrefix}.`;
                                    let m = await args.output(setMsg + " Type `undo` in the next 30 seconds to undo this change.");
                                    if (m) {
                                        let matches = await msg.channel.awaitMessages(
                                            m => m.author.id === msg.author.id && m.content.toLowerCase().startsWith("undo"),
                                            { maxMatches: 1, time: 30 * 1000 }
                                        );
                                        if (matches.size !== 0) {
                                            writeRes = await args.wrappedDB.store("guild.prefix", guild);
                                            if (writeRes) {
                                                let revertMsg = `Prefix was successfully reverted to ${curPrefix}.`;
                                                if (m.deleted) return revertMsg;
                                                else await m.edit(`~~${setMsg}~~ ${revertMsg}`);
                                            }
                                            else return "Failed to undo prefix change.";
                                        } else if (!m.deleted) await m.edit(setMsg);
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
            },
            {
                name: "eval",
                description: "Evaluates code (owner only)",
                usage: "<code>",
                perms: "bot_owner",
                run(msg, args) {
                    //TODO: Config option to disable eval (global.core.disableEval ?)
                    function getErrorMessage(e) {
                        if (typeof e === "string") return e;
                        else if (typeof e === "object") return `(\`${e.name || "Error"}\`): ${e.message || "Unknown error"}`;
                        return "Unknown error";
                    }
                    let evalCode = args.content.slice(args.command.length).trimLeft();
                    if (!evalCode) return "No code specified.";
                    this.module.logger(`User ${msg.author.username}#${msg.author.discriminator} (${msg.author.id}) used eval: "${evalCode}"`);
                    let text = `Input: \`\`\`js\n${evalCode}\`\`\``;
                    try {
                        //jshint -W061
                        let evalRes = eval(evalCode);
                        if (evalRes instanceof Promise) {
                            let out = args.output(text + "Result: [`PROMISE`]");
                            return evalRes.then(v => out.then(m => m.edit(`${m.content}\`\`\`js\n${inspect(v, false, 0)}\`\`\``)))
                                .catch(e => out.then(m => m.edit(`${m.content}\nAsync Error: ${getErrorMessage(e)}`)));
                        }
                        else return text + `Result: \`\`\`js\n${inspect(evalRes, false, 0)}\`\`\``;
                    } catch (e) {
                        return text + `Error: ${getErrorMessage(e)}`;
                    }
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