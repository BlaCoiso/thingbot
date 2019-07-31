//objectDB.js: DB Provider using JS Objects
//Copyright (c) 2019 BlaCoiso
//This file is part of thingBot, licensed under GPL v3.0
//jshint esversion: 6

const BaseDB = require("./baseDBProvider.js");
const DBErrors = require("./DBError");

class ObjectDB extends BaseDB {
    constructor(options, logger) {
        super(options, logger);
        this.volatile = true;
        this.ready = true;
        this.data = {};
        logger("Using fallback Object DB, all data will be lost on restart", "warn");
    }
    readPathSync(path) {
        if (this.hasCache(path)) return this.readCache(path);
        let obj = this.data;
        for (let key of path) {
            if (typeof obj === "object" && Object.keys(obj).includes(key)) obj = obj[key];
            else {
                if (this.failIfMissing) throw new DBErrors.DBPathError(null, this.getPathKey(path));
                else return null;
            }
        }
        this.writeCache(path, obj);
        return obj;
    }
    storePathSync(path, value) {
        let obj = this.data;
        for (let i = 0; i < path.length - 1; ++i) {
            if (typeof obj[path[i]] !== "object") obj[path[i]] = {};
            obj = obj[path[i]];
        }
        obj[path[path.length - 1]] = value;
        this.writeCache(path, value);
        return true;
    }
    hasPathSync(path) {
        let obj = this.data;
        for (let key of path) {
            if (typeof obj === "object" && Object.keys(obj).includes(key)) obj = obj[key];
            else return false;
        }
        return true;
    }
    removePathSync(path) {
        let obj = this.data;
        for (let i = 0; i < path.length - 1; ++i) {
            if (typeof obj[path[i]] !== "object") return false;
            obj = obj[path[i]];
        }
        delete obj[path[path.length - 1]];
        this.removeCache(path);
        return true;
    }
}

module.exports = ObjectDB;