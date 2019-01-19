//jshint esversion: 6
const fs = require("fs");
const modulePath = "./bot_modules";
const BaseModule = require("./moduleBase");
const commandRegex = /^[0-9a-zA-Z_\-\.]+$/;

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
    init(logger, logWrapper, eventCallback, config) {
        this.logger = logger;
        this.logWrapper = logWrapper;
        this.eventCallback = eventCallback;
        this.config = config;
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
            logger(`Loaded ${moduleCount}/${this.modules.length} modules`);
            return Array.from(this.handledEvents.keys());
        } else {
            logger("Failed to load bot modules", "fail");
            return null;
        }
    }
    handle(event, client, ...args) {
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
        function handleCommandOutput(output) {
            if (output) {
                //TODO: Bot permission checks (send message, embed, upload)
                let outputChannel = (cmdObj.sendDM && output.sendDM !== false) ? message.author : message.channel;
                let sendOptions = {};
                if (cmdObj.reply && output.reply !== false) sendOptions.reply = message.author;
                if (typeof output === "string") {
                    return outputChannel.send(output, sendOptions)
                        .catch(e => this.logger("Failed to send command response", e));
                }
                else if (output instanceof Promise) {
                    output.then(out => handleCommandOutput(out))
                        .catch(e => this.logger(`Failed to handle asynchronous command '${command}'`, e));
                    return true;
                } else {
                    //TODO: Embeds, permissions, merge options
                    if (output.text && typeof output.text === "string") {
                        return outputChannel.send(output.text, sendOptions)
                            .catch(e => this.logger("Failed to send command response", e));
                    }
                    return false;
                }
            }
            return false;
        }
        if (cmdObj) {
            //TODO: User permission checks and command permissions
            //TODO: Possibly add a message for when command is unavailable in DMs
            if (args.isDM && cmdObj.disableDM) return;
            args.output = handleCommandOutput;
            if (!cmdObj.output || !handleCommandOutput(cmdObj.output)) {
                try {
                    handleCommandOutput(cmdObj.run(message, args));
                }
                catch (e) {
                    cmdObj.module.logger(`Failed to handle command '${command}'`, e);
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
            if (moduleObj.name === "Module") moduleObj.name = moduleName[0].toUpperCase() + moduleName.slice(1);
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
        moduleObj.init(moduleObj.logger, this.config);
        //TODO: Bind and init external database
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
            if (moduleObj) return this.initModule(moduleObj, moduleName);
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
            this.unloadModule(moduleName);
            return this.loadModule(moduleName);
        } else this.logger("Attempted to reload a module that wasn't loaded", "warn");
    }
    reload() {
        this.loadedModules.clear();
        this.commands.clear();
        this.handledEvents.clear();
        for (let moduleName of this.modules) {
            delete require.cache[require.resolve(modulePath + '/' + moduleName)];
            this.loadModule(moduleName);
        }
        if (this.loadedModules.size === 0) {
            this.logger("No modules loaded after reload", "fatal");
            process.exit(1);
        }
    }
}
module.exports = new ModuleLoader();