//jshint esversion: 6

class DatabaseError extends Error {
    constructor(message) {
        super(message);
        this.name = "DatabaseError";
    }
}

class DBPathError extends DatabaseError {
    constructor(message, path) {
        if (!message) message = `Path '${path}' doesn't exist`;
        super(message);
        this.name = "DBPathError";
        this.path = path;
    }
}

class DBAccessError extends DatabaseError {
    constructor(message, path) {
        if (!message) message = `Failed to access ${path ? "path '" + path + "'" : "database"}`;
        super(message);
        this.name = "DBAccessError";
        this.path = path;
    }
}

module.exports = {
    DatabaseError: DatabaseError,
    DBPathError: DBPathError,
    DBAccessError: DBAccessError
};