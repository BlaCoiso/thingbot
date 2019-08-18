//levelDB.js: DB Provider for LevelDB backend
//Copyright (c) 2019 BlaCoiso
//This file is part of thingBot, licensed under GPL v3.0
//jshint esversion: 6
const leveldown = require("leveldown");
const BaseDB = require("./baseDBProvider");
const DBErrors = require("./DBError");

const DataTypes = {
    invalidType: -1,
    nullType: 0,
    objectType: 1,
    trueType: 2,
    falseType: 3,
    arrayGeneric: 4,
    arrayString: 5,
    arrayInt: 6,
    i16: 7,
    i32: 8,
    f64: 9,
    stringType: 32
};

class LevelDB extends BaseDB {
    constructor(options, logger) {
        super(options, logger);
        this.async = true;
        this.failIfMissing = true;
        this.DBPath = this.options.path;
        if (!this.DBPath || typeof this.DBPath !== "string") {
            logger("Database path not specified, using default path", "warn");
            this.DBPath = "levelDB";
        }
        this.DBPath = this.resolveFilePath(this.DBPath);
        this.levelDB = leveldown(this.DBPath);
        this.attemptedRepair = false;
    }
    /*
        Value store:
        First byte contains type, may contain payload
        LEN: variable length encoding value: bit 7(MSB) set=read next
            max=2^31-1
        Null: 0
        Object: 1
        True: 2
        False: 3
        Generic array: 4
            Array values are stored as key-value pairs, with key=basekey.i
        String array: 5 LEN data
            Contents must all be strings, encoding=str (LEN) + strdata
        LEN array: 6 LEN data
        i16: 7 data
        i32: 8 data
        f64: 9 data
        string: 32 data
    */
    init() {
        return new Promise((resolve, reject) => {
            this.levelDB.open(e => {
                if (e) {
                    if (this.attemptedRepair) reject(e);
                    else {
                        this.logger("Failed to open DB, attempting to repair...", "warn", e);
                        leveldown.repair(this.DBPath, re => {
                            this.attemptedRepair = true;
                            if (re) reject(re);
                            else {
                                this.levelDB = leveldown(this.DBPath);
                                this.init().then(v => resolve(v)).catch(ie => reject(ie));
                            }
                        });
                    }
                } else {
                    this.ready = true;
                    let testIt = this.levelDB.iterator({ limit: 1, values: false, keyAsBuffer: false });
                    testIt.next((e, k) => {
                        testIt.end(e => e && this.logger("Failed to end initial iterator", e));
                        if (e) reject(e);
                        else {
                            if (k) this.initialized = true;
                            resolve(true);
                        }
                    });
                }
            });
        });
    }
    /**
     * Parses DB data into an object with the correct type
     * @param {string} base Base key
     * @param {string[]} keys List of keys
     * @param {Buffer[]} values List of values
     */
    parseData(base, keys, values) {
        if (keys.length === 0) {
            if (this.failIfMissing) throw new DBErrors.DBPathError(null, base);
            return;
        }
        let data;
        let baseIndex = keys.indexOf(base);
        /**@type {Buffer} */
        let baseData;
        /**@type {number} */
        let type;
        if (baseIndex === -1) type = DataTypes.objectType;
        else {
            baseData = values[baseIndex];
            type = baseData.readUInt8(0);
        }
        let subKeys, subValues, objKeys;
        let temp, offset, count;
        switch (type) {
            case DataTypes.nullType:
                data = null;
                break;
            case DataTypes.objectType:
                //Object
                subKeys = keys.filter(k => k.startsWith(base + '.'));
                subValues = values.filter((v, i) => subKeys.includes(keys[i]));
                objKeys = subKeys.map(k => k.replace(base + '.', ""));
                data = {};
                for (let key in subKeys) {
                    let subKey = subKeys[key];
                    let objKey = objKeys[key].split('.');
                    let obj = data;
                    while (objKey.length > 1) {
                        let tmpKey = objKey.shift();
                        if (!obj[tmpKey]) obj[tmpKey] = {};
                        obj = obj[tmpKey];
                    }
                    obj[objKey[0]] = this.parseData(subKey, subKeys, subValues);
                }
                break;
            case DataTypes.trueType:
                data = true;
                break;
            case DataTypes.falseType:
                data = false;
                break;
            case DataTypes.arrayGeneric:
                //Generic array
                data = [];
                subKeys = keys.filter(k => k.startsWith(base + '.'));
                subValues = values.filter((v, i) => subKeys.includes(keys[i]));
                objKeys = subKeys.map(k => parseInt(k.replace(base + '.', "")));
                for (let key in objKeys) {
                    let index = objKeys[key];
                    data[index] = this.parseData(subKeys[key], subKeys, subValues);
                }
                break;
            case DataTypes.arrayString:
                //String array
                temp = getVarInt(baseData, 1);
                count = temp[0];
                offset = temp[1];
                data = [];
                while (count--) {
                    temp = getVarInt(baseData, offset);
                    offset = temp[1];
                    let length = temp[0];
                    data.push(baseData.toString("utf8", offset, offset + length));
                    offset += length;
                }
                break;
            case DataTypes.arrayInt:
                //LEN array
                temp = getVarInt(baseData, 1);
                count = temp[0];
                offset = temp[1];
                data = [];
                while (count--) {
                    temp = getVarInt(baseData, offset);
                    offset = temp[1];
                    data.push(temp[0]);
                }
                break;
            case DataTypes.i16:
                data = baseData.readInt16LE(1);
                break;
            case DataTypes.i32:
                data = baseData.readInt32LE(1);
                break;
            case DataTypes.f64:
                data = baseData.readDoubleLE(1);
                break;
            case DataTypes.stringType:
                data = baseData.toString("utf8", 1);
                break;
            default:
                this.logger("Unknown data type " + type, "error");
                break;
        }
        return data;
    }
    /**
     * Gets all keys and values of an object
     * @param {string} baseKey 
     */
    getObjectKeyValues(baseKey) {
        return new Promise((resolve, reject) => {
            const endChar = String.fromCharCode('.'.charCodeAt(0) + 1);
            let it = this.levelDB.iterator({ gte: baseKey, lt: baseKey + endChar, keyAsBuffer: false, fillCache: true });
            let keys = [];
            let values = [];
            let logger = this.logger.bind(this);
            function recursiveCollectPaths(e, k, v) {
                if (e) reject(e);
                else {
                    if (k) {
                        if ((k === baseKey || k.startsWith(baseKey + '.'))) {
                            keys.push(k);
                            values.push(v);
                        }
                        it.next(recursiveCollectPaths);
                    } else {
                        it.end(e => e && logger("Failed to end path iterator", e));
                        resolve([keys, values]);
                    }
                }
            }
            it.next(recursiveCollectPaths);
        });
    }
    getObjectKeys(baseKey) {
        return new Promise((resolve, reject) => {
            const endChar = String.fromCharCode('.'.charCodeAt(0) + 1);
            let it = this.levelDB.iterator({ gte: baseKey, lt: baseKey + endChar, keyAsBuffer: false, values: false });
            let keys = [];
            let logger = this.logger.bind(this);
            function recursiveCollectPaths(e, k, v) {
                if (e) reject(e);
                else {
                    if (k) {
                        if ((k === baseKey || k.startsWith(baseKey + '.'))) keys.push(k);
                        it.next(recursiveCollectPaths);
                    } else {
                        it.end(e => e && logger("Failed to end path iterator", e));
                        resolve(keys);
                    }
                }
            }
            it.next(recursiveCollectPaths);
        });
    }
    makeObjectData(base, value) {
        let data = { keys: [], values: [] };
        let type = detectType(value);
        let writeValue, len, writeData, offset;
        switch (type) {
            case DataTypes.nullType:
            case DataTypes.trueType:
            case DataTypes.falseType:
                data.keys.push(base);
                data.values.push(Buffer.from([type]));
                break;
            case DataTypes.stringType:
                data.keys.push(base);
                data.values.push(" " + value);
                break;
            case DataTypes.i16:
                data.keys.push(base);
                writeValue = Buffer.from([type, 0, 0]);
                writeValue.writeInt16LE(value, 1);
                data.values.push(writeValue);
                break;
            case DataTypes.i32:
                data.keys.push(base);
                writeValue = Buffer.from([type, 0, 0, 0, 0]);
                writeValue.writeInt32LE(value, 1);
                data.values.push(writeValue);
                break;
            case DataTypes.f64:
                data.keys.push(base);
                writeValue = Buffer.from([type, 0, 0, 0, 0, 0, 0, 0, 0]);
                writeValue.writeDoubleLE(value, 1);
                data.values.push(writeValue);
                break;
            case DataTypes.arrayInt:
            case DataTypes.arrayString:
                data.keys.push(base);
                len = makeVarInt(value.length);
                writeData = [len];
                if (type === DataTypes.arrayInt) {
                    for (let i = 0; i < value.length; ++i) writeData.push(makeVarInt(value[i]));
                } else {
                    for (let i = 0; i < value.length; ++i) {
                        let str = value[i];
                        let encodedLen = makeVarInt(str.length);
                        let encodedStr = Buffer.from(str, "utf8");
                        writeData.push(encodedLen);
                        writeData.push(encodedStr);
                    }
                }
                writeValue = new Uint8Array(writeData.reduce((a, v) => a + v.length, 0) + 1);
                writeValue[0] = type;
                offset = 1;
                for (let i = 0; i < writeData.length; ++i) {
                    writeValue.set(writeData[i], offset);
                    offset += writeData[i].length;
                }
                data.values.push(Buffer.from(writeValue.buffer));
                break;
            case DataTypes.arrayGeneric:
                data.keys.push(base);
                data.values.push(Buffer.from([type]));
                for (let i = 0; i < value.length; ++i) {
                    let v = value[i];
                    if (v !== undefined) {
                        writeData = this.makeObjectData(base + '.' + i, v);
                        data.keys = data.keys.concat(writeData.keys);
                        data.values = data.values.concat(writeData.values);
                    }
                }
                break;
            case DataTypes.objectType:
                data.keys.push(base);
                data.values.push(Buffer.from([type]));
                Object.keys(value).forEach(k => {
                    let objKey = base + '.' + this.fixKey(k);
                    writeData = this.makeObjectData(objKey, value[k]);
                    data.keys = data.keys.concat(writeData.keys);
                    data.values = data.values.concat(writeData.values);
                });
        }
        return data;
    }
    doBulkStore(base, value, toDelete) {
        let objectData = this.makeObjectData(base, value);
        return this.doBulkOp(objectData.keys, objectData.values, toDelete);
    }
    doBulkDelete(keys) {
        return this.doBulkOp([], [], keys);
    }
    doBulkOp(storeKeys, storeValues, deleteKeys) {
        return new Promise((resolve, reject) => {
            deleteKeys = deleteKeys.filter(k => !storeKeys.includes(k));
            let ops = [];
            for (let k of deleteKeys) ops.push({ type: "del", key: k });
            for (let i = 0; i < storeKeys.length; ++i) {
                let k = storeKeys[i];
                let v = storeValues[i];
                ops.push({ type: "put", key: k, value: v });
            }
            if (ops.length === 0) resolve(false);
            else this.levelDB.batch(ops, e => {
                if (e) reject(e);
                else resolve(true);
            });
        });
    }
    readPath(path) {
        let basePath = path.join('.');
        return this.getObjectKeyValues(basePath).then(data => this.parseData(basePath, data[0], data[1]));
    }
    storePath(path, value) {
        return new Promise((resolve, reject) => {
            let basePath = path.join('.');
            this.levelDB.get(basePath, (e, v) => {
                if (e) {
                    let c = path.length - 1;
                    let tryThing = (e, v) => {
                        if (e) {
                            if (c > 0) this.levelDB.get(path.slice(0, c--).join('.'), tryThing);
                            else this.doBulkStore(basePath, value, [])
                                .then(v => resolve(v)).catch(e => reject(e));
                        } else {
                            let oldType = v.readUInt8(0);
                            if (oldType !== DataTypes.objectType) {
                                this.getObjectKeys(path.slice(0, ++c).join('.'))
                                    .then(keys => this.doBulkStore(basePath, value, keys[0]))
                                    .then(v => resolve(v))
                                    .catch(e => reject(e));
                            } else this.doBulkStore(basePath, value, [])
                                .then(v => resolve(v)).catch(e => reject(e));
                        }
                    };
                    if (c > 0) this.levelDB.get(path.slice(0, c--).join('.'), tryThing);
                    else this.doBulkStore(basePath, value, [])
                        .then(v => resolve(v)).catch(e => reject(e));
                } else {
                    let oldType = v.readUInt8(0);
                    if (oldType === DataTypes.objectType || oldType === DataTypes.arrayGeneric) {
                        this.getObjectKeys(basePath)
                            .then(keys => this.doBulkStore(basePath, value, keys))
                            .then(v => resolve(v))
                            .catch(e => reject(e));
                    } else this.doBulkStore(basePath, value, [])
                        .then(v => resolve(v)).catch(e => reject(e));
                }
            });
        });
    }
    hasPath(path) {
        return this.getObjectKeys(path.join('.')).then(keys => keys.length > 0);
    }
    removePath(path) {
        return this.getObjectKeys(path.join('.')).then(keys => this.doBulkDelete(keys));
    }
}
module.exports = LevelDB;

/**
 * Reads a variable length integer from a buffer at an offset
 * @param {Buffer} buffer 
 * @param {number} offset 
 */
function getVarInt(buffer, offset) {
    let v;
    let shift = 0;
    let r = 0;
    do {
        v = buffer.readInt8(offset++);
        r += (v & 0x7F) << shift;
        shift += 7;
    } while (v < 0);
    return [r, offset];
}

function makeVarInt(value) {
    let tempA = [];
    while (value & ~0x7F) {
        tempA.push((value & 0x7F) | 0x80);
        value >>= 7;
    }
    tempA.push(value);
    return Uint8Array.from(tempA);
}

function detectType(value) {
    if (value === null || value === undefined) return DataTypes.nullType;
    else if (typeof value === "object") {
        if (Array.isArray(value)) {
            if (value.length > 0) {
                let isValid = true;
                if (typeof value[0] === "string") {
                    for (let i = 0; i < value.length; ++i) {
                        if (typeof value[i] !== "string") {
                            isValid = false;
                            break;
                        }
                    }
                    if (isValid) return DataTypes.arrayString;
                    else return DataTypes.arrayGeneric;
                } else if (typeof value[0] === "number") {
                    for (let i = 0; i < value.length; ++i) {
                        let v = value[i];
                        if (typeof v !== "number" || !Number.isInteger(v) || v >= Math.pow(2, 31) || -v >= Math.pow(2, 31)) {
                            isValid = false;
                            break;
                        }
                    }
                    if (isValid) return DataTypes.arrayInt;
                    else return DataTypes.arrayGeneric;
                }
            }
            return DataTypes.arrayGeneric;
        } else return DataTypes.objectType;
    } else if (typeof value === "string") return DataTypes.stringType;
    else if (typeof value === "number") {
        let v = Math.abs(value);
        if (Number.isInteger(v)) {
            if (v < Math.pow(2, 15)) return DataTypes.i16;
            else if (v < Math.pow(2, 31)) return DataTypes.i32;
            else return DataTypes.f64;
        } else return DataTypes.f64;
    } else if (value === true) return DataTypes.trueType;
    else if (value === false) return DataTypes.falseType;
    else return DataTypes.invalidType;
}