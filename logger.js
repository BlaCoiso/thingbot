var hasNode = false;
var hasBrowser = false;

try {
    module.exports = Logger;
    hasNode = true;
} catch (e) {
    console.log("no node support, ", e);
    window.Logger = Logger;
    hasBrowser = true;
}

function Logger(minLogLevel, logCB, moduleName) {
    var levels = ["DEBUG", "INFO", "WARN", "ERROR", "FAIL"];
    var levelsAlt = ["VERBOSE", "INFORMATION", "WARNING", "ERR", "FATAL"];
    /**
     * Creates a log string to be written to a file or to the console
     * @param {string} message 
     * @param {string} moduleName 
     * @param {string} level 
     * @param {Error?} error 
    */
    function getLog(message, moduleName, level, error) {
        var timestamp = getTimeStamp(new Date());
        if (!error && level && level.message && level.stack) {
            error = level;
            level = "ERROR";
        }
        var logLevel = (typeof level === "number" ? levels[level] : (level ? level.toUpperCase() : null));
        if (levelsAlt.indexOf(logLevel) !== -1) logLevel = levels[levelsAlt.indexOf(logLevel)];
        else if (levels.indexOf(logLevel) === -1) logLevel = levels[1];
        var logValue = levels.indexOf(logLevel);
        if (error) {
            logValue = Math.max(logValue, levels.indexOf("ERROR"));
            logLevel = levels[logValue];
        }
        var errorMessage = error ? (error.stack ? (error.stack.replace(error.name, function (name) { return '(' + name + ')'; })) :
            ('(' + (error.name || "Error") + ')' + (error.message ? (": " + error.message) : ""))) : null;
        return {
            timestamp: timestamp,
            level: [logValue, logLevel],
            message: message,
            module: moduleName || "UNKNOWN",
            error: error ? errorMessage : null
        };
    }
    /**
     * Gets the timestamp string for a date
     * @param date {Date}
    */
    function getTimeStamp(date) {
        function zeroPadding(value, length) {
            value = String(value);
            while (value.length < length) {
                value = "0" + value;
            }
            return value;
        }
        return date.getUTCFullYear() + '-' + zeroPadding(date.getUTCMonth(), 2) + '-' +
            zeroPadding(date.getUTCDate(), 2) + 'T' +
            zeroPadding(date.getUTCHours(), 2) + ':' + zeroPadding(date.getUTCMinutes(), 2) + ':' +
            zeroPadding(date.getUTCSeconds(), 2) + '.' + zeroPadding(date.getUTCMilliseconds(), 3) + 'Z';
    }
    function logString(log) {
        return log.timestamp + " " + log.level[1] + "\t[" + log.module + "]:\t" + log.message + (log.error ? (": " + log.error) : "");
    }
    if (!minLogLevel) minLogLevel = levels.indexOf("INFO");
    if (typeof minLogLevel === "string") minLogLevel = Math.max(
        levels.indexOf(minLogLevel.toUpperCase()),
        levelsAlt.indexOf(minLogLevel.toUpperCase())
    );
    if (moduleName) return function logMessage(message, level, error) {
        var log = getLog(message, moduleName, level, error);
        if (log.level[0] < minLogLevel) return;
        logCB(logString(log), log.level);
    };
    else return function logMessage(message, moduleName, level, error) {
        var log = getLog(message, moduleName, level, error);
        if (log.level[0] < minLogLevel) return;
        logCB(logString(log), log.level);
    };
}
Logger.levels = ["DEBUG", "INFO", "WARN", "ERROR", "FAIL"];
Logger.levelsAlt = ["VERBOSE", "INFORMATION", "WARNING", "ERR", "FATAL"];