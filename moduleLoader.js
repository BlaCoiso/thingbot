//moduleLoader.js: Loads modules and handles events
//Copyright 2018-2019 BlaCoiso
//This file is part of thingBot, licensed under GPL v3.0
//jshint esversion: 6
const fs = require("fs");
const modulePath = "./bot_modules";
const BaseModule = require("./moduleBase");
const commandRegex = /^[0-9a-zA-Z_\-\.]+$/;
const Discord = require("discord.js");

class ModuleLoader {
    constructor() {
        this.modules = [];
        this.loadedModules = new Map();
        this.commands = new Map();
        this.logger = null;
        this.logWrapper = null;
        this.handledEvents = new Map();
        this.commandRegex = commandRegex;
    }
    init(logger, logWrapper, eventCallback, DB) {
        this.logger = logger;
        this.logWrapper = logWrapper;
        this.eventCallback = eventCallback;
        this.DB = DB;
        if (fs.existsSync(modulePath)) {
            let moduleDir = fs.readdirSync(modulePath);
            this.modules = moduleDir.filter(m => m.endsWith(".js")).map(m => m.replace(/\.js$/, ""));
            var moduleCount = 0;
            for (let moduleName of this.modules) {
                try {
                    /** @type {BaseModule} */
                    let moduleObj = require(modulePath + '/' + moduleName);
                    if (moduleObj && this.initModule(moduleObj, moduleName))++moduleCount;
                } catch (e) {
                    logger(`Error initializing module ${moduleName}`, e);
                }
            }
            if (this.modules.length === 0) {
                logger("No modules to be loaded", "fatal");
                process.abort();
            } else if (moduleCount === 0) {
                logger("Failed to load any module", "fatal");
                process.abort();
            }
            logger(`Loaded ${moduleCount}/${this.modules.length} modules`, "debug");
            return Array.from(this.handledEvents.keys());
        } else {
            logger("Failed to load bot modules", "fail");
            return null;
        }
    }
    handle(event, client, DB, ...args) {
        var handlers = this.handledEvents.get(event);
        if (handlers && Array.isArray(handlers) && handlers.length !== 0) {
            for (let moduleObj of handlers) {
                try {
                    moduleObj.handle.apply(moduleObj, arguments);
                } catch (e) {
                    moduleObj.logger(`Failed to handle '${event}' event`, e);
                }
            }
        }
    }
    handleCommand(command, message, args) {
        var cmdObj = this.commands.get(command);
        var logger = this.logger;
        function handleCommandOutput(output) {
            function sendMessage(content, channel, options) {
                return channel.send(content, options).catch(e => logger("Failed to send command response", e));
            }
            if (output) {
                let outputChannel = ((cmdObj && cmdObj.sendDM) ? output.sendDM !== false : output.sendDM) ? message.author : message.channel;
                let sendOptions = {};
                let botPerms = args.getBotPerms(outputChannel);
                if ((cmdObj && cmdObj.reply) ? output.reply !== false : output.reply) sendOptions.reply = message.author;
                if (typeof output === "string") {
                    if (botPerms.send) return sendMessage(output, outputChannel, sendOptions);
                }
                else if (output instanceof Promise) return output.then(out => handleCommandOutput(out))
                    .catch(e => logger(`Failed to handle asynchronous command '${command}'`, e));
                else if (typeof output === "object") {
                    if (output instanceof Discord.Message) { }
                    else if (output instanceof Discord.RichEmbed) {
                        if (botPerms.embed) {
                            sendOptions.embed = output;
                            return sendMessage(sendOptions, outputChannel);
                        }
                    } else if (output instanceof Discord.Attachment) {
                        if (botPerms.attach) {
                            sendOptions.file = output;
                            return sendMessage(sendOptions, outputChannel);
                        }
                    } else {
                        if (output.split) sendOptions.split = output.split;
                        if (typeof output.disableEveryone === "boolean") sendOptions.disableEveryone = output.disableEveryone;
                        if (output.tts) sendOptions.tts = true;
                        if (output.code) sendOptions.code = output.code;
                        if (output.attachment && botPerms.attach) {
                            if (Array.isArray(output.attachment)) sendOptions.files = output.attachment;
                            else sendOptions.file = output.attachment;
                        }
                        if (output.options && typeof output.options === "object") Object.assign(sendOptions, options);
                        if (output.embed && botPerms.embed) {
                            sendOptions.embed = output.embed;
                            return sendMessage(sendOptions, outputChannel);
                        }
                        else if (output.text && botPerms.send) {
                            if (botPerms.send) return sendMessage(output.text, outputChannel, sendOptions);
                        } else if (output.attachment && botPerms.attach) return sendMessage(sendOptions, outputChannel);
                        if (output.embed && !output.text && !botPerms.embed && botPerms.send) sendMessage(args.getError("NO_EMBED"), outputChannel);
                    }
                }
            }
            return Promise.resolve(false);
        }
        args.setOutputCallback(handleCommandOutput);
        if (cmdObj) {
            if (args.isDM && cmdObj.disableDM) handleCommandOutput(args.getError("NO_DM"));
            else if (!args.checkPerms(cmdObj.perms)) handleCommandOutput(args.getError("NO_PERMS"));
            else {
                args.setDBContext({ module: cmdObj.module });
                if (!cmdObj.output || !handleCommandOutput(cmdObj.output)) {
                    let commandFailLog = `Failed to handle command '${command}'`;
                    if (cmdObj.prefetch) {
                        args.wrappedDB.prefetch(cmdObj.prefetch).then(p => {
                            args.setPrefetched(p);
                            handleCommandOutput(cmdObj.run(message, args));
                        }, e => {
                            this.logger(`Failed to prefetch paths for command ${command}`, e);
                            handleCommandOutput(args.getError("EXEC_ERR"));
                        }).catch(e => {
                            cmdObj.module.logger(commandFailLog, e);
                            handleCommandOutput(args.getError("EXEC_ERR"));
                        });
                    } else {
                        try {
                            handleCommandOutput(cmdObj.run(message, args));
                        }
                        catch (e) {
                            cmdObj.module.logger(`Failed to handle command '${command}'`, e);
                            handleCommandOutput(args.getError("EXEC_ERR"));
                        }
                    }
                }
            }
        } else this.handle("command", message.client, command, message, args);
    }
    /**
     * Initializes a module
     * @param {BaseModule} moduleObj 
     */
    initModule(moduleObj, moduleName) {
        let events = [];
        if (moduleObj.name === "Module") moduleObj.name = moduleName[0].toUpperCase() + moduleName.slice(1);
        if (moduleObj.events) {
            if (typeof moduleObj.events === "string") {
                let evt = moduleObj.events.toLowerCase();
                events = [evt];
            }
            else if (Array.isArray(moduleObj.events)) events = moduleObj.events;
            else {
                this.logger(`Module ${moduleObj.name} (${moduleName}) has invalid handled event definition`, "warn");
                return false;
            }
        }
        else if (!(moduleObj.commands && Array.isArray(moduleObj.commands) && moduleObj.commands.length !== 0)) {
            this.logger(`Module ${moduleObj.name} (${moduleName}) doesn't specify handled events, ignoring`, "warn");
            return false;
        }
        for (let evt of events) {
            evt = evt.toLowerCase();
            if (!this.handledEvents.has(evt)) this.handledEvents.set(evt, [moduleObj]);
            else {
                let handled = this.handledEvents.get(evt);
                if (!handled.includes(moduleObj)) handled.push(moduleObj);
            }
        }
        moduleObj.logger = this.logWrapper(moduleObj.name);
        moduleObj.init(moduleObj.logger, this.DB);
        this.logger(`Initialized module ${moduleName}`, "debug");
        //TODO: Add some kind of utility class thing to be given to all modules
        this.loadedModules.set(moduleName, moduleObj);
        if (moduleObj.commands && Array.isArray(moduleObj.commands) && moduleObj.commands.length !== 0) {
            for (let command of moduleObj.commands) {
                command.module = moduleObj;
                if (!command.name || typeof command.name !== "string") {
                    this.logger(`Module ${moduleObj.name} has invalid commands, aborting command loading`, "warn");
                    break;
                }
                this.registerCommand(command);
            }
        }
        return true;
    }
    /**
     * Registers a commmand
     * @param {ModuleCommand} command 
     */
    registerCommand(command) {
        command.name = command.name.toLowerCase();
        if (this.commands.has(command.name)) {
            //Assume it's an issue with the module unloader/reloader and not duplicate commands
            this.logger(`Command ${command.name} was already registered, ignoring command`, "debug");
            return;
        }
        if (commandRegex.test(command.name)) this.registerCommandName(command.name, command);
        if (command.aliases) {
            if (typeof command.aliases === "string") this.registerCommandName(command.aliases, command);
            else if (Array.isArray(command.aliases) && command.aliases.length !== 0) {
                for (let alias of command.aliases) {
                    if (commandRegex.test(alias)) this.registerCommandName(alias, command);
                }
            }
        }
    }
    registerCommandName(name, command) {
        if (!this.commands.has(name) && typeof name === "string") this.commands.set(name.toLowerCase(), command);
    }
    getCommands() {
        let result = [];
        for (let moduleObj of this.loadedModules.values()) {
            if (moduleObj.commands && Array.isArray(moduleObj.commands)) {
                for (let command of moduleObj.commands) {
                    if (this.commands.get(command.name.toLowerCase()) === command) result.push(command);
                }
            }
        }
        return result;
    }
    loadModule(moduleName) {
        try {
            if (this.loadedModules.has(moduleName)) this.unloadModule(moduleName);
            if (!this.modules.includes(moduleName)) this.modules.push(moduleName);
            let moduleObj = require(modulePath + '/' + moduleName);
            if (moduleObj) {
                if (moduleObj.events) this.eventCallback(moduleObj.events);
                return this.initModule(moduleObj, moduleName);
            }
        } catch (e) {
            this.logger(`Error initializing module ${moduleName}`, e);
        }
    }
    unloadModule(moduleName) {
        if (this.loadedModules.has(moduleName)) {
            try {
                /** @type {BaseModule} */
                let moduleObj = this.loadedModules.get(moduleName);
                let events;
                if (typeof moduleObj.events === "string") events = [moduleObj.events];
                else if (Array.isArray(moduleObj.events)) events = moduleObj.events;
                for (let event of events) {
                    let eventHandlers = this.handledEvents.get(event);
                    if (!eventHandlers) continue;
                    let evtIdx = eventHandlers.indexOf(moduleObj);
                    if (evtIdx === -1) continue;
                    eventHandlers.splice(evtIdx, 1);
                }
                if (moduleObj.commands && Array.isArray(moduleObj.commands)) {
                    for (let cmd of moduleObj.commands) {
                        let cmdName = cmd.name.toLowerCase();
                        let cmdAliases = [];
                        if (typeof cmd.aliases === "string") cmdAliases = [cmd.aliases.toLowerCase()];
                        else if (Array.isArray(cmd.aliases)) cmdAliases = cmd.aliases.map(a => a.toLowerCase());
                        cmdAliases.push(cmdName);
                        for (let alias of cmdAliases) {
                            if (this.commands.get(alias) === cmd) this.commands.delete(alias);
                        }
                    }
                }
                let modIdx = this.modules.indexOf(moduleName);
                if (modIdx !== -1) this.modules.splice(modIdx, 1);
                this.loadedModules.delete(moduleName);
                delete require.cache[require.resolve(modulePath + '/' + moduleName)];
                return true;
            } catch (e) {
                this.logger(`Failed to unload module ${moduleName}`, e);
            }
        } else this.logger(`Attempted to unload already unloaded module ${moduleName}`, "warn");
    }
    reloadModule(moduleName) {
        if (this.loadedModules.has(moduleName) || this.modules.includes(moduleName)) {
            let moduleObj = this.loadedModules.get(moduleName);
            this.unloadModule(moduleName);
            let result = this.loadModule(moduleName);
            if (!result && moduleObj) {
                try {
                    this.initModule(moduleObj, moduleName);
                } catch (e) {
                    this.logger("Failed to revert module from cache", e);
                }
            }
            if (this.loadedModules.size === 0) {
                this.logger("No modules loaded after reload", "fatal");
                process.abort();
            } else return result;
        } else this.logger("Attempted to reload a module that wasn't loaded", "warn");
    }
    reload() {
        let oldLoaded = new Map(this.loadedModules);
        this.loadedModules.clear();
        this.commands.clear();
        this.handledEvents.clear();
        let recovered = 0;
        for (let moduleName of this.modules) {
            delete require.cache[require.resolve(modulePath + '/' + moduleName)];
            if (!this.loadModule(moduleName)) {
                if (oldLoaded.has(moduleName)) {
                    let moduleObj = oldLoaded.get(moduleName);
                    try {
                        if (this.initModule(moduleObj, moduleName))++recovered;
                    } catch (e) {
                        this.logger("Failed to revert module from cache", e);
                    }
                }
            }
        }
        if (this.loadedModules.size === 0) {
            this.logger("No modules loaded after reload", "fatal");
            process.abort();
        }
        return this.loadedModules.size - recovered;
    }
}
module.exports = new ModuleLoader();