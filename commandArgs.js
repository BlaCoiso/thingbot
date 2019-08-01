//commandArgs.js: Parses and handles command arguments
//Copyright (c) 2019 BlaCoiso
//This file is part of thingBot, licensed under GPL v3.0
//jshint esversion: 6

class CommandArgs {
    constructor(message, DB, prefix, moduleLoader) {
        if (!prefix) prefix = "";
        this.message = message;
        this.client = message.client;
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
        this.parsedArgs = null;
        this.output = function () { };
        this.wrappedDB = null;
        this.prefetched = {};
    }
    /** @returns {string[]} */
    getArgs() {
        return this.args || this.content.split(" ").filter(a => a.trim() !== "");
    }
    getParsed() {
        if (this.parsedArgs) return this.parsedArgs;
        else {
            let parsed = [];
            const userRegex = /<@!?([0-9]+)>/g;
            const channelRegex = /<#([0-9]+)>/g;
            const roleRegex = /<@&([0-9]+)>/g;
            const emoteRegex = /<a?:([0-9a-zA-Z_]+):([0-9]+)>/g;
            let args = this.getArgs();
            for (let arg of args) {
                let matches = [];
                let match;
                while ((match = userRegex.exec(arg))) {
                    match.type = "user";
                    matches.push(match);
                }
                while ((match = channelRegex.exec(arg))) {
                    match.type = "channel";
                    matches.push(match);
                }
                while ((match = roleRegex.exec(arg))) {
                    match.type = "role";
                    matches.push(match);
                }
                while ((match = emoteRegex.exec(arg))) {
                    match.type = "emote";
                    matches.push(match);
                }
                matches = matches.sort((a, b) => a.index - b.index);
                if (matches.length === 0) parsed.push({
                    type: "text",
                    value: arg,
                    text: arg
                });
                else {
                    let prevInd = 0;
                    for (let match of matches) {
                        if (prevInd !== match.index) {
                            let temp = arg.slice(prevInd, match.index);
                            parsed.push({
                                type: "text",
                                value: temp,
                                text: temp
                            });
                        }
                        prevInd = match.index + match[0].length;
                        let matchData = {
                            type: match.type,
                            value: match[1],
                            text: match[0]
                        };
                        if (match.type === "user") {
                            let user = this.client.users.get(match[1]);
                            let userMember = this.isDM ? null : this.message.guild.members.get(match[1]);
                            if (userMember) {
                                matchData.text = '@' + userMember.displayName;
                                matchData.value = userMember.user;
                            } else if (user) {
                                matchData.text = '@' + user.username;
                                matchData.value = user;
                            }
                        } else if (match.type === "channel") {
                            let channel = this.client.channels.get(match[1]);
                            if (channel) {
                                matchData.value = channel;
                                if (channel.name) matchData.text = '#' + channel.name;
                                else if (channel.recipient) matchData.text = '#' + channel.recipient.username;
                            }
                        } else if (match.type === "role") {
                            if (!this.isDM) {
                                let role = this.message.guild.roles.get(match[1]);
                                if (role) {
                                    matchData.value = role;
                                    matchData.text = '@' + role.name;
                                }
                            }
                        } else if (match.type === "emote") {
                            let emote = this.client.emojis.get(match[2]);
                            if (emote) matchData.value = emote;
                            else matchData.value = match[0];
                            matchData.text = ':' + match[1] + ':';
                        }
                        parsed.push(matchData);
                    }
                    if (prevInd !== arg.length) {
                        let temp = arg.slice(prevInd, arg.length);
                        parsed.push({
                            type: "text",
                            value: temp,
                            text: temp
                        });
                    }
                }
            }
            this.parsed = parsed;
            return parsed;
        }
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