//baseDBProvider.js: Base interface for DB Providers
//Copyright (c) 2019 BlaCoiso
//This file is part of thingBot, licensed under GPL v3.0
//jshint esversion: 6
function fixKey(key) {
    if (key && typeof key === "string") return key.replace(/[^a-zA-Z0-9_-]+/g, '_');
    else return "null";
}

const DBErrors = require("./DBError");

class BaseDBProvider {
    constructor(options, logger) {
        /** Database provider name */
        this.name = this.constructor.name || "DBBase";
        /** Database options */
        this.options = options || {};
        /** Logger object for DB */
        this.logger = logger;
        /** Cache of DB data */
        this.cache = new Map();
        /** Data is volatile and not persistent through reloads */
        this.volatile = false;
        /** Database needs sync before read */
        this.requiresSync = false;
        /** Database needs flush after write */
        this.requiresFlush = false;
        /** Database is asynchronous */
        this.async = false;
        /** Database is already initialized */
        this.initialized = false;
        /** Database is ready to be used */
        this.ready = false;
        /** If true, throw an DBPathError when the path is missing on reads */
        this.failIfMissing = (options && options.failIfMissing) || false;
        /** Database root directory (used to store database files) */
        this.DBRoot = __dirname;
        this.filePathChar = (this.DBRoot.includes('\\') ? '\\' : '/');
        if (!this.DBRoot.endsWith(this.filePathChar)) this.DBRoot += this.filePathChar;
        //DB Provider can extend this with more stuff
    }
    /**
     * Resolves a file path into an absolute path
     * @param {string} path 
     */
    resolveFilePath(path) {
        let resolvedPath = path.replace(/[\\/]/g, this.filePathChar);
        let absolute = false;
        if (resolvedPath.includes(this.filePathChar)) {
            let splitPath = resolvedPath.split(this.filePathChar);
            if (process.platform === "win32") {
                if (resolvedPath.match(/^[a-zA-Z]:/)) absolute = true;
                else if (resolvedPath.startsWith(this.filePathChar)) splitPath.shift();
            } else if (resolvedPath.startsWith(this.filePathChar)) absolute = true;
            splitPath = splitPath.filter(p => p && p !== ".");
            resolvedPath = splitPath.join(this.filePathChar);
        }
        if (!absolute) resolvedPath = this.DBRoot + resolvedPath;
        return resolvedPath;
    }
    /**
     * Initializes the DB
     */
    init() {
        return Promise.resolve(true);
    }
    readRoot() {
        return this.readPath([]);
    }
    /**
     * Reads a value in the DB at the specified path
     * @param {string} path path to the value
     */
    read(path) {
        return this.readPath(this.parsePath(path));
    }
    /** 
     * Stores a value in the DB at the specified path
     * @param {string} path path to the value
     * @param value value to be stored
     */
    store(path, value) {
        return this.storePath(this.parsePath(path), value);
    }
    /**
     * Removes a value from the DB
     * @param {string} path path to the value
     */
    remove(path) {
        return this.removePath(this.parsePath(path));
    }
    /** 
     * Checks if a path exists
     * @param {string} path path to check
     */
    has(path) {
        return this.hasPath(this.parsePath(path));
    }
    /**
     * Prefetches one or more paths to be used later
     * @param {string|string[]} path Paths to prefetch
     */
    prefetch(path) {
        let paths = [];
        if (typeof path === "string") paths.push(path);
        else if (Array.isArray(path)) {
            paths = path;
        }
        if (paths.length > 0) {
            if (this.async) {
                let promises = [];
                paths.forEach(p => promises.push(this.has(p).then(h => h ? this.read(p) : undefined)));
                return Promise.all(promises).then(values => {
                    let data = {};
                    values.forEach((v, i) => data[paths[i]] = v);
                    return data;
                });
            } else {
                try {
                    let data = {};
                    paths.forEach(p => data[p] = this.readPathSync(this.parsePath(p)));
                    return Promise.resolve(data);
                } catch (e) {
                    return Promise.reject(e);
                }
            }
        }
        return Promise.resolve({});
    }
    /**
     * Stores an object into the DB
     * @param {string[]} path Path to the object
     * @param object Object to be stored
     */
    storeObject(path, object, depth) {
        if (!depth) depth = 0;
        if (typeof object === "object" && !Array.isArray(object)) {
            let promises = [];
            if (depth > 20) return Promise.reject(new DBErrors.DatabaseError("Recursive object depth reached"));
            Object.keys(object).forEach(k => promises.push(this.storeObject(path.concat(fixKey(k)), object[k], depth + 1)));
            return Promise.all(promises).then(r => r.reduce((a, c) => a && c, true));
        } else return this.storePath(path, object);
    }
    /**
     * Caches an object into the cache
     * @param {string[]} path Path to the object
     * @param {*} value Value of the object to be cached
     */
    writeCache(path, value) {
        for (let i = 0; i < path.length; ++i) {
            let key = this.getPathKey(path.slice(0, i));
            this.cache.delete(key);
        }
        this.removeCache(path);
        this.cache.set(this.getPathKey(path), value);
    }
    /**
     * Reads an object from the cache
     * @param {string[]} path Path to the object
     */
    readCache(path) {
        if (this.requiresSync && !this.async) {
            if (this.isPathModifiedSync(path)) return this.readPathSync(path);
        }
        return this.cache.get(this.getPathKey(path));
    }
    /**
     * Removes an object from the cache
     * @param {string[]} path Path to the object
     */
    removeCache(path) {
        let baseKey = this.getPathKey(path);
        let cacheKeys = Array.from(this.cache.keys()).filter(k => k.startsWith(baseKey));
        cacheKeys.forEach(k => this.cache.delete(k));
    }
    /**
     * Checks if an object is cached
     * @param {string[]} path Path to the object
     */
    hasCache(path) {
        return this.cache.has(this.getPathKey(path));
    }
    /**
     * Parses a DB path into an array
     * @param {string|string[]} path 
     * @returns {string[]}
     */
    parsePath(path) {
        if (typeof path === "string") {
            path = path.replace(/\.+/g, '.').split('.');
        } else if (Array.isArray(path)) {
            path = path.filter(p => typeof p === "string" && !p.includes('.'));
        } else path = [];
        return path.map(k => fixKey(k));
    }
    getPathKey(path) {
        return path.join('.');
    }
    fixKey(key) {
        return fixKey(key);
    }
    //Methods that need to be implemented by the DB Provider
    readPathSync(path) {
        return null;
    }
    storePathSync(path, value) {
        return false;
    }
    hasPathSync(path) {
        return false;
    }
    removePathSync(path) {
        return false;
    }
    isPathModifiedSync(path) {
        return false;
    }
    flushSync() {
        return true;
    }

    //Async methods that need to be overridden by async DB Providers
    readPath(path) {
        try {
            return Promise.resolve(this.readPathSync(path));
        } catch (e) {
            return Promise.reject(e);
        }
    }
    storePath(path, value) {
        try {
            return Promise.resolve(this.storePathSync(path, value));
        } catch (e) {
            return Promise.reject(e);
        }
    }
    hasPath(path) {
        try {
            return Promise.resolve(this.hasPathSync(path));
        } catch (e) {
            return Promise.reject(e);
        }
    }
    removePath(path) {
        try {
            return Promise.resolve(this.removePathSync(path));
        } catch (e) {
            return Promise.reject(e);
        }
    }
    isPathModified(path) {
        try {
            return Promise.resolve(this.isPathModifiedSync(path));
        } catch (e) {
            return Promise.reject(e);
        }
    }
    flush() {
        try {
            return Promise.resolve(this.flush());
        } catch (e) {
            return Promise.reject(e);
        }
    }
}
module.exports = BaseDBProvider;