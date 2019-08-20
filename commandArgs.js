//commandArgs.js: Parses and handles command arguments
//Copyright (c) 2019 BlaCoiso
//This file is part of thingBot, licensed under GPL v3.0
//jshint esversion: 6

const messageErrors = {
    NO_PERMS: "You don't have permissions to use this command.",
    NO_EMBED: "This command needs embed permissions.",
    NO_BOT_PERMS: "I don't have permission to do that.",
    NO_DM: "This command is unavailable in DMs.",
    EXEC_ERR: "An error occurred while executing this command.",
    PERM_REQ: "You need $1 permissions to use this command.",
    BOT_PERM_REQ: "I need $1 permissions to do that."
};

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
        this.getArgs();
        this.parsedArgs = null;
        this.output = function () { };
        this.setDBContext({ user: message.author, guild: message.guild });
        this.prefetched = {};
        this.botPerms = this.getBotPerms(message.channel);
        this.setPerms();
    }
    getBotPerms(channel) {
        let perms = {
            send: true,
            embed: true,
            attach: true
        };
        if (channel) {
            if (channel.type === "dm" || channel.type === "group" || channel.dmChannel || !channel.permissionsFor) {
            } else {
                let botPermissions = channel.permissionsFor(this.client.user);
                if (botPermissions) {
                    if (!botPermissions.has("SEND_MESSAGES")) {
                        perms.send = false;
                        perms.embed = false;
                        perms.attach = false;
                    } else {
                        if (!botPermissions.has("EMBED_LINKS")) perms.embed = false;
                        if (!botPermissions.has("ATTACH_FILES")) perms.attach = false;
                    }
                }
            }
            return perms;
        }
        return this.botPerms || perms;
    }
    /** @returns {string[]} */
    getArgs() {
        if (!this.args) {
            let split = this.content.split(" ").filter(a => a.trim() !== "");
            this.command = split && split.length > 0 ? split.shift().toLowerCase() : "";
            this.args = split;
        }
        return this.args;
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
    getError(id, ...args) {
        if (messageErrors[id]) return messageErrors[id].replace(/\$([0-9]+)/g, (match, arg) => args[parseInt(arg) - 1] || match);
        else return id;
    }
    setOutputCallback(out) {
        this.output = out;
    }
    setDBContext(context) {
        if (!this.DBContext) this.DBContext = {};
        if (context && typeof context === "object") {
            if (context.user) this.DBContext.user = context.user;
            if (context.guild) this.DBContext.guild = context.guild;
            if (context.module) this.DBContext.module = context.module;
        }
        this.wrappedDB = this.DB.getWrapped(this.DBContext.module, this.DBContext.guild, this.DBContext.user);
    }
    setPrefetched(data) {
        Object.assign(this.prefetched, data);
    }
    setContent(content) {
        this.args = null;
        this.content = content;
        this.getArgs();
        if (this.parsedArgs) {
            this.parsedArgs = null;
            this.getParsed();
        }
    }
    setPerms(permissions) {
        if (!this.perms) this.perms = [];
        let newPerms = [];
        if (permissions) {
            if (typeof permissions === "string") newPerms.push(permissions);
            else if (Array.isArray(permissions)) newPerms = newPerms.concat(permissions);
        } else {
            let user = this.message.author;
            if (this.DB.getOwnerList().includes(user.id)) newPerms.push("bot_owner");
            if (!this.isDM) {
                let member = this.message.member;
                if (member.hasPermission("ADMINISTRATOR")) newPerms.push("admin");
                if (member.hasPermission("KICK_MEMBERS")) newPerms.push("kick");
                if (member.hasPermission("BAN_MEMBERS")) newPerms.push("ban");
                if (member.hasPermission("MANAGE_CHANNELS")) newPerms.push("channels");
                if (member.hasPermission("MANAGE_GUILD")) newPerms.push("server");
                if (member.hasPermission("MANAGE_MESSAGES")) newPerms.push("messages");
                if (member.hasPermission("MANAGE_NICKNAMES")) newPerms.push("nicknames");
                if (member.hasPermission("MANAGE_ROLES")) newPerms.push("roles");
                if (member.hasPermission("MANAGE_WEBHOOKS")) newPerms.push("webhooks");
                if (member.hasPermission("MANAGE_EMOJIS")) newPerms.push("emojis");
            }
        }
        this.perms = this.perms.concat(newPerms.filter((p, i) => p && newPerms.indexOf(p) === i && !this.perms.includes(p)));
    }
    checkPerms(requiredPerms) {
        if (!requiredPerms || (Array.isArray(requiredPerms) && requiredPerms.length === 0)) return true;
        if (typeof requiredPerms === "string") requiredPerms = [requiredPerms];
        if (!Array.isArray(requiredPerms)) return true;
        return requiredPerms.some(p => this.perms.includes(p));
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