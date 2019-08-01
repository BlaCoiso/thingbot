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
        var timestamp = new Date().toISOString();
        if (!error && level && (level.message || level.stack)) {
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
            ('(' + (error.name || "Error") + ')' + (error.message ? (": " + error.message.replace(/[\r\n]+^/, "")) : ""))) : null;
        return {
            timestamp: timestamp,
            level: [logValue, logLevel],
            message: message.replace(/[\r\n]+^/, ""),
            module: moduleName || "UNKNOWN",
            error: error ? errorMessage : null
        };
    }
    function logString(log) {
        return log.timestamp + " " + log.level[1] + "\t[" + log.module + "]:\t" +
            log.message.replace(/\n[ \t]*/g, "\n    ") + (log.error ? (": " + log.error) : "");
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