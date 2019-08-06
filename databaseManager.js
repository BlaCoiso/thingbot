//databaseManager.js: Manages config and database
//Copyright (c) 2019 BlaCoiso
//This file is part of thingBot, licensed under GPL v3.0
//jshint esversion: 6
const DBFallback = require("./database/objectDB");
const BaseDB = require("./database/baseDBProvider");
const DBErrors = require("./database/DBError");

const configGeneratorVersion = 0;

class DatabaseManager {
    constructor(config, logger, logWrapper, client) {
        this.logger = logger;
        this.logWrapper = logWrapper;
        this.config = config;
        this.client = client;
        this.guilds = new Map();
        /**@type {BaseDB?} */
        this.DB = null;
        if (config.database && (typeof config.database === "string" || config.database.provider)) {
            /**@type {string} */
            let providerName = config.database.provider || config.database;
            let providerModuleName = providerName.replace(/\.js$/, "");
            let options = {};
            if (typeof config.database === "object") {
                Object.assign(options, config.database);
                if (config.database.options) Object.assign(options, config.database.options);
            }
            let fixMatch = providerModuleName.match(/[\\\/]*([a-zA-Z0-9_\-]+)(?:\.js)?[\\\/]*/);
            if (fixMatch[1] !== providerModuleName) {
                logger(`Invalid database provider name, assuming '${providerModuleName}'`, "warn");
                providerModuleName = fixMatch[1];
            }
            let DBModule = tryFindDB(providerModuleName, logger);
            if (!DBModule) logger(`Failed to find database provider '${providerModuleName}'`, "error");
            else {
                logger(`Initializing DB Provider ${providerModuleName} (${DBModule.DBName}.js)...`, "debug");
                try {
                    this.DB = new DBModule(options, logWrapper(DBModule.name || DBModule.DBName));
                } catch (e) {
                    logger("Failed to initialize DB provider", e);
                    this.DB = null;
                    this.useFallbackDB(logWrapper);
                }
                if (DBModule !== DBFallback && this.DB.volatile)
                    logger("Database provider is volatile, data will be lost after restarting", "warn");
            }
        }
        if (!this.DB) this.useFallbackDB(logWrapper);
    }
    useFallbackDB(logWrapper) {
        if (!this.DB) {
            this.logger("No database provider found, using fallback DB", "warn");
            this.DB = new DBFallback({}, logWrapper(DBFallback.name || "FallbackDB"));
        }
    }
    init() {
        return new Promise((resolve, reject) => {
            this.DB.init().then(s => {
                if (!s || !this.DB.ready) throw new DBErrors.DatabaseError("Failed to initialize DB");
                let requests = [];
                if (this.DB.initialized) {
                    if (this.config.useDBConfig) {
                        //TODO: Possibly convert this into an async function
                        requests.push(this.DB.prefetch(["global.prefix", "global.token"]).then(d => {
                            this.config.prefix = d["global.prefix"];
                            this.config.token = d["global.token"];
                        }).catch(e => {
                            if (!this.config.token || typeof this.config.prefix !== "string") {
                                this.logger("Failed to prefetch bot config from DB", "fail", e);
                                throw new DBErrors.DatabaseError("Config prefetch failed");
                            } else this.logger("Failed to prefetch bot config from DB, using saved config", "warn", e);
                        }));
                        requests.push(this.DB.has("global.reconnectTime").then(r => {
                            if (r) return this.DB.read("global.reconnectTime").then(recTime => this.config.reconnectTime = recTime);
                        }));
                        requests.push(this.DB.has("global.ownerList").then(r => {
                            if (r) return this.DB.read("global.ownerList").then(ownList => this.config.ownerID = ownList);
                        }));
                    }
                    requests.push(this.checkDBUpdates());
                } else {
                    if (this.config.useDBConfig) {
                        if (!this.config.token || typeof this.config.prefix !== "string") {
                            this.logger("Unable to fetch bot config from uninitialized DB", "fail");
                            throw new DBErrors.DatabaseError("Config prefetch failed");
                        } else this.logger("Database bot config is uninitialized, using saved config", "warn");
                    }
                    requests.push(this.initDBData());
                }
                Promise.all(requests).then(() => resolve(true)).catch(e => reject(e));
            }).catch(e => reject(e));
        });
    }
    initDBData() {
        let globalData = {
            configInitTS: Date.now(),
            version: configGeneratorVersion
        };
        if (this.config.saveDBConfig) Object.assign(globalData, {
            prefix: this.getPrefix(),
            token: this.getToken(),
            reconnectTime: this.getReconnectTime(),
            owners: this.getOwnerList()
        });
        return this.DB.store("global", globalData);
    }
    updateDBData(oldVersion) {
        return this.DB.read("global").then(g => {
            let updates = [];
            if (this.config.saveDBConfig && !g.token) {
                updates.push(this.DB.store("global.prefix", this.getPrefix()));
                updates.push(this.DB.store("global.token", this.getToken()));
                updates.push(this.DB.store("global.reconnectTime", this.getReconnectTime()));
                updates.push(this.DB.store("global.owners", this.getOwnerList()));
            }
            //TODO: When DB version changes, update based on old version
            return Promise.all(updates);
        });
    }
    checkDBUpdates() {
        return this.DB.read("global.version").then(v => {
            if (v !== configGeneratorVersion) return this.updateDBData(v);
            else return this.DB.has("global.configInitTS").then(h => {
                //if configInitTS doesn't exist then wait for data to be initialized
                if (!h) return this.updateDBData(v);
                else return true;
            });
        }, e => {
            this.logger("Failed to read DB version, attempting to reinitialize", "warn", e);
            return this.initDBData();
        });
    }
    initGuildDB(guild) {
        if (guild && guild.available && guild.id) {
            this.guilds.set(guild.id, guild);
            let key = "guilds." + guild.id;
            return this.DB.has(key).then(h => {
                if (!h) {
                    let guildData = {
                        prefix: "",
                        version: configGeneratorVersion,
                        initTS: Date.now(),
                        moduleData: {},
                        users: {}
                    };
                    return this.DB.store("guilds." + guild.id, guildData);
                } else return false;
                //TODO: Check updates if needed
            });
        } else {
            if (guild && guild.id) return Promise.reject(new Error(`Guild ${guild.id} is unavailable`));
            else if (!guild || !guild.id) return Promise.reject(new TypeError("Invalid guild object"));
        }
    }
    translatePath(path, context) {
        if (!path || typeof path !== "string") return "";
        if (!context) context = {};
        let guild = context.guild;
        let guildID = guild ? (typeof guild === "string" ? guild : guild.id) : "";
        let user = context.user;
        let userID = user ? (typeof user === "string" ? user : user.id) : "";
        let moduleContext = context.module;
        let moduleName = moduleContext ? (typeof moduleContext === "string" ? moduleContext : moduleContext.name) : "";
        if (moduleName) moduleName = moduleName[0].toLowerCase() + moduleName.slice(1);
        /*
            global.module -> global.moduleData.moduleName (global data for module)
            module -> global.module
            guild -> guilds.gID (guild data)
            guild.module -> guild.moduleData.moduleName (guild data for module)
            guild.user -> guild.users.uID
            guild.user.module -> guild.user.moduleData.moduleName
            user -> users.uID (user data)
            user.module -> user.moduleData.moduleName (user data for module)
        */
        const guildMatchRegex = /^guild(?=$|\.)/;
        const userMatchRegex = /^(guild\.|guilds\.[0-9]+\.)?user(?=$|\.)/;
        const moduleMatchRegex = /^((?:global|(?:guild|guilds\.[0-9]+)?(?:\.)?(?:user|users\.[0-9]+)?)\.)module(?=$|\.)/;
        let translated = path.replace(/^module(?=$|\.)/, "global.module");
        if (translated.match(guildMatchRegex)) {
            if (!guildID) return "";
            translated = translated.replace(guildMatchRegex, `guilds.${guildID}`);
        }
        if (translated.match(userMatchRegex)) {
            if (!userID) return "";
            translated = translated.replace(userMatchRegex, `$1users.${userID}`);
        }
        if (translated.match(moduleMatchRegex)) {
            if (!moduleName) return "";
            translated = translated.replace(moduleMatchRegex, `$1moduleData.${moduleName}`);
        }
        return translated;
    }
    translatorWrapper(func, path, moduleName, guild, user, arg2) {
        let translatedPath = this.translatePath(path, { guild: guild, user: user, module: moduleName });
        if (translatedPath) return func(translatedPath, arg2);
        else return Promise.reject(new DBErrors.DBPathError(`Failed to resolve path '${path}'`, path));
    }
    read(path, moduleName, guild, user) {
        return this.translatorWrapper(this.DB.read.bind(this.DB), path, moduleName, guild, user);
    }
    store(path, value, moduleName, guild, user) {
        return this.translatorWrapper(this.DB.store.bind(this.DB), path, moduleName, guild, user, value);
    }
    remove(path, moduleName, guild, user) {
        return this.translatorWrapper(this.DB.remove.bind(this.DB), path, moduleName, guild, user);
    }
    has(path, moduleName, guild, user) {
        return this.translatorWrapper(this.DB.has.bind(this.DB), path, moduleName, guild, user);
    }
    prefetch(path, moduleName, guild, user) {
        let requestedPaths = [];
        if (typeof path === "string") requestedPaths.push(path);
        else if (Array.isArray(path)) requestedPaths = path.map(p => p.trim()).filter(p => p);
        if (requestedPaths.length === 0) return Promise.resolve({});
        else {
            let translateContext = { guild: guild, user: user, module: moduleName };
            let translatedPaths = requestedPaths.map(p => this.translatePath(p, translateContext));
            if (translatedPaths.find(p => !p)) return Promise.reject(
                new DBErrors.DBPathError(`Failed to resolve paths '${requestedPaths.filter((p, i) => !translatedPaths[i]).join(", ")}'`, requestedPaths)
            );
            else return this.DB.prefetch(translatedPaths).then(data => {
                let translatedData = {};
                requestedPaths.forEach((p, i) => translatedData[p] = data[translatedPaths[i]]);
                return translatedData;
            });
        }
    }
    getWrapped(moduleName, guild, user) {
        let readFunc = this.read.bind(this);
        let storeFunc = this.store.bind(this);
        let removeFunc = this.remove.bind(this);
        let hasFunc = this.has.bind(this);
        let prefetchFunc = this.prefetch.bind(this);
        return {
            read: function readWrapped(path) {
                return readFunc(path, moduleName, guild, user);
            }, store: function storeWrapped(path, value) {
                return storeFunc(path, value, moduleName, guild, user);
            }, remove: function removeWrapped(path) {
                return removeFunc(path, moduleName, guild, user);
            }, has: function hasWrapped(path) {
                return hasFunc(path, moduleName, guild, user);
            }, prefetch: function prefetchWrapped(path) {
                return prefetchFunc(path, moduleName, guild, user);
            }
        };
    }
    getToken() {
        let token = this.config.token;
        if (token && typeof token === "string" && token.length > 5) return token;
        return null;
    }
    getReconnectTime() {
        let recTime = this.config.reconnectTime || this.config.reconnect;
        const defaultRecTime = 30;
        if (!recTime) return defaultRecTime;
        else if (typeof recTime === "number" && Number.isFinite(recTime));
        else if (typeof recTime === "string") {
            let temp = parseInt(recTime);
            if (Number.isFinite(temp)) recTime = temp;
            else recTime = defaultRecTime;
        }
        else recTime = defaultRecTime;
        this.config.reconnectTime = recTime;
    }
    getPrefix() {
        let prefix = this.config.prefix;
        if (prefix && typeof prefix === "string") return prefix;
        else return "";
    }
    getOwnerList() {
        let owners = this.config.ownerID;
        let ownerList = this.config.ownerList;
        if (ownerList) return ownerList;
        else ownerList = [];
        if (!owners) return ownerList;
        else if (typeof owners === "string") ownerList = [owners];
        else if (typeof owners === "number") ownerList = [owners.toString()];
        else if (Array.isArray(owners) && owners.length > 0) ownerList = owners
            .map(o => typeof o === "string" ? o : (typeof o === "number" ? o.toString() : ""))
            .filter(o => o);
        this.config.ownerList = ownerList;
        return ownerList;
    }
}

function tryFindDB(moduleName, logger) {
    //name.js, DBname.js, nameDB.js, nameProvider.js, nameDBProvider.js
    let moduleAttempts = [moduleName, "DB" + moduleName, moduleName + "DB",
        moduleName + "Provider", moduleName + "DBProvider"];
    let basePath = "./database/";
    for (var i = 0; i < moduleAttempts.length; ++i) {
        let attemptName = moduleAttempts[i];
        try {
            let modObj = require(basePath + attemptName);
            if (modObj && modObj.prototype instanceof BaseDB) {
                modObj.DBName = attemptName;
                return modObj;
            }
        } catch (e) {
            if (e && e.message &&
                !(e.message.toLowerCase().includes("cannot find module") && e.message.includes(attemptName)))
                logger(`Failed to load DB Provider '${moduleName}' (${attemptName}.js)`, e);
        }
    }
    return null;
}


module.exports = DatabaseManager;