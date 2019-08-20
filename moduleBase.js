//moduleBase.js: Base module code
//Copyright (c) 2018-2019 BlaCoiso
//This file is part of thingBot, licensed under GPL v3.0
//jshint esversion:6
const Discord = require("discord.js");

const OutputObject = {
    /** Send output to DM */
    sendDM: false,
    /** Reply to user */
    reply: false,
    split: false,
    disableEveryone: false,
    tts: false,
    code: null,
    options: {},
    text: "output message contents",
    embed: null,
    attachment: null
};

class BaseModule {
    constructor() {
        /** Module's name */
        this.name = "Module";
        /** Module's description */
        this.description = "";
        /**
         * Events handled by this module
         * @type {string|string[]?}
        */
        this.events = null;
        /**
         * Commands used by this module
         * @type {ModuleCommand[]?}
         */
        this.commands = null;
    }
    /** Initializes the module */
    init(logger, DB) {
        this.logger = logger;
        this.DB = DB;
    }
    /**
     * Handles a Discord event
     * @param {string} event Name of the event
     * @param {Discord.Client} client Discord Client object
     * @param {DatabaseManager} DB Database object
     * @param  {...any} args Event arguments
     */
    handle(event, client, DB, ...args) {
    }
}

class ModuleCommand {
    constructor() {
        /** Command's name */
        this.name = "command";
        /** Command's description */
        this.description = "description";
        //TODO: Multiple usage strings
        this.usage = "[optional] {required} {opt1|opt2|opt3}";
        /**
         * Aliases for this command
         * @type {string|string[]?}
         */
        this.aliases = ["alias1", "alias2"];
        /**
         * Output of the command (static response), 
         * Command.run is used instead if not defined
         * @type {OutputObject|string?}
         */
        this.output = "Command output";
        /** If true, the command is disabled on DMs */
        this.disableDM = false;
        /** If true, will reply to the user with the response */
        this.reply = false;
        /** If true, will send the response into the user's DMs */
        this.sendDM = false;
        /**
         * List of DB paths to prefetch before executing command
         * @type {string|string[]?}
         */
        this.prefetch = ["module.var1", "guild.module.var2"];
        /**
         * List of permissions required to use the command (user must have at least one of them)
         * @type {string|string[]?}
         */
        this.perms = ["perm1", "perm2"];
    }
    /**
     * Run the command
     * @param {Discord.Message} message 
     * @param {} args 
     */
    run(message, args) {
        //Expected return values:
        //String: send string to channel
        //Promise: send resolved promise results to channel 
        //Object: check OutputObject
    }
}
module.exports = BaseModule;