//jshint esversion:6
const Discord = require("discord.js");

//This is just the structure of the object with the command args
const ArgsObject = {
    isDM: false,
    globalPrefix: "/",
    prefix: "asdf",
    content: "asdf asdf",
    args: ["asdf"],
    command: "asdf",
    moduleLoader: {}
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
    init(logger, config) {
        this.logger = logger;
        this.config = config;
    }
    /**
     * Handles a Discord event
     * @param {string} event 
     * @param {Discord.Client} client 
     * @param  {...any} args 
     */
    handle(event, client, ...args) {
    }
}

class ModuleCommand {
    constructor() {
        /** Command's name */
        this.name = "command";
        /** Command's description */
        this.description = "description";
        //TODO: Help -> usage
        /**
         * Aliases for this command
         * @type {string|string[]?}
         */
        this.aliases = ["alias1", "alias2"];
        /**
         * Output of the command (static response), 
         * Command.run is used instead if not defined
         * @type {string?}
         */
        this.output = "Command output";
        /** If true, the command is disabled on DMs */
        this.disableDM = false;
        /** If true, will reply to the user with the response */
        this.reply = false;
        /** If true, will send the response into the user's DMs */
        this.sendDM = false;
        //TODO: Permissions
    }
    /**
     * Run the command
     * @param {Discord.Message} message 
     * @param {ArgsObject} args 
     */
    run(message, args) {
    }
}
module.exports = BaseModule;