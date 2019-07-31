//commandArgs.js: Parses and handles command arguments
//Copyright (c) 2019 BlaCoiso
//This file is part of thingBot, licensed under GPL v3.0
//jshint esversion: 6

class CommandArgs {
    constructor(message, DB, prefix, moduleLoader) {
        if (!prefix) prefix = "";
        this.message = message;
        this.channelType = this.message.channel.type;
        this.isDM = this.channelType === "dm" || this.channelType === "group";
        if (!prefix && !this.isDM) return;
        this.DB = DB;
        this.prefix = prefix;
        this.moduleLoader = moduleLoader;
        this.content = message.content.slice(prefix.length).trimLeft();
        let split = this.getArgs();
        this.command = split && split.length > 0 ? split.shift().toLowerCase() : "";
        this.args = split;
        this.output = function () { };
        this.wrappedDB = null;
        this.prefetched = {};
    }
    getArgs() {
        return this.args || this.content.split(" ").filter(a => a.trim() !== "");
    }
    setOutputCallback(out) {
        this.output = out;
    }
    setWrappedDB(wDB) {
        this.wrappedDB = wDB;
    }
    setPrefetched(data) {
        this.prefetched = data;
    }
    loadModule(modName) {
        modName = checkModName(modName);
        if (modName) return this.moduleLoader.loadModule(modName);
    }
    unloadModule(modName) {
        modName = checkModName(modName);
        if (modName) return this.moduleLoader.unloadModule(modName);
    }
    reloadModule(modName) {
        modName = checkModName(modName);
        if (modName) return this.moduleLoader.reloadModule(modName);
    }
    reloadAll() {
        return this.moduleLoader.reload();
    }
    getCommands() {
        return this.moduleLoader.getCommands();
    }
    getModules() {
        return this.moduleLoader.modules;
    }
    getLoadedModules() {
        return Array.from(this.moduleLoader.loadedModules.values());
    }
    findCommand(name) {
        return this.moduleLoader.commands.get(name);
    }
}

function checkModName(name) {
    if (!name || typeof name !== "string") return null;
    if (name.match(/^[a-zA-Z0-9_-]+(?:\.js)?$/)) return name.replace(/\.js$/, "");
    return null;
}

module.exports = CommandArgs;