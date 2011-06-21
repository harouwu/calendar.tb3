/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Inverse inc. code.
 *
 * The Initial Developer of the Original Code is
 *  Wolfgang Sourdeau  <wsourdeau@inverse.ca>
 * Portions created by the Initial Developer are
 *  Copyright (C) 2008-2010 Inverse inc. All Rights Reserved.
 *
 * Contributor(s):
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

/* helpers */
function fixURL(url) {
    if (!url) {
        dump("fixURL: no URL! - backtrace\n" + STACK());
        throw("fixURL: no URL!\n");
    }
    let fixedURL = url;
    if (fixedURL[fixedURL.length-1] != '/')
        fixedURL += '/';

    return fixedURL;
}

/* CalDAVACLOfflineManager */
function CalDAVACLOfflineManager() {
    this.initDB();
}

function createStatement(dbconn, sql) {
    let stmt = dbconn.createStatement(sql);
    let wrapper = Components.classes["@mozilla.org/storage/statement-wrapper;1"]
                            .createInstance(Components.interfaces.mozIStorageStatementWrapper);
    wrapper.initialize(stmt);
    return wrapper;
}

CalDAVACLOfflineManager.prototype = {
    /* calendar entries:
     * - hasAccessControl
     * - userPrivileges
     * - userAddresses
     * - userIdentities
     * - userPrincipals
     * - ownerAddresses
     * - ownerIdentities
     * - ownerPrincipal
     *
     * item entries:
     * - userPrivileges
     */

    initDB: function CalDAVACLOfflineManage_initDB() {
        let dbFile = cal.getCalendarDirectory();
        dbFile.append("caldav-acl.sqlite");
        let dbService = Components.classes["@mozilla.org/storage/service;1"]
                                  .getService(Components.interfaces.mozIStorageService);
        this.mDB = dbService.openDatabase(dbFile);
        let dbVersion = -1;
        if (this.mDB.tableExists("acl_meta")) {
            let stmt = createStatement(this.mDB, "SELECT value FROM acl_meta WHERE key = 'version'");
            let txtVersion = null;
            try {
                stmt.step();
                txtVersion = stmt.row.value;
            }
            catch (exc) {
            }
            finally {
                stmt.reset();
            };
            if (txtVersion) {
                dbVersion = parseInt(txtVersion);
            }
        }
        else {
            dump("tables do NOT exists\n");
        }

        let updated = false;
        if (dbVersion < 0) {
            createStatement(this.mDB, "CREATE TABLE acl_meta (key TEXT PRIMARY KEY ASC NOT NULL, value TEXT NOT NULL)")();
            createStatement(this.mDB, "CREATE TABLE acl_calendar_entries (url TEXT PRIMARY KEY ASC NOT NULL, has_access_control INTEGER, user_privileges TEXT, user_addresses TEXT, user_principals TEXT, user_identities TEXT, owner_addresses TEXT, owner_principal TEXT, owner_identities TEXT)")();
            createStatement(this.mDB, "CREATE TABLE acl_item_entries (url TEXT PRIMARY KEY ASC NOT NULL, user_privileges TEXT)")();
            dbVersion = 0;
            updated = true;
        }

        this.prepareStatements();
        if (updated) {
            this.setACLMeta("version", String(dbVersion));
        }
    },

    prepareStatements: function CalDAVACLOfflineManager_prepareStatements() {
        /* meta data */
        this.mGetACLMeta = createStatement(this.mDB,
                                           "SELECT value FROM acl_meta"
                                           + " WHERE key = :key");
        this.mInsertACLMeta = createStatement(this.mDB,
                                              "INSERT INTO acl_meta"
                                              + " (key, value)"
                                              + " VALUES(:key, :value)");
        this.mUpdateACLMeta = createStatement(this.mDB,
                                              "UPDATE acl_meta"
                                              + " SET value = :value"
                                              + " WHERE key = :key");
        this.mDeleteACLMeta = createStatement(this.mDB,
                                              "DELETE FROM acl_meta"
                                              + " WHERE key = :key");

        /* calendar entries */
        this.mSelectCalendarEntry = createStatement(this.mDB,
                                                    "SELECT has_access_control, user_privileges,"
                                                    +"  user_addresses, user_principals, user_identities,"
                                                    +"  owner_addresses, owner_principal, owner_identities"
                                                    + " FROM acl_calendar_entries"
                                                    + " WHERE url = :url");
        this.mInsertCalendarEntry = createStatement(this.mDB,
                                                    "INSERT INTO acl_calendar_entries"
                                                    + " (url, has_access_control, user_privileges,"
                                                    + "  user_addresses, user_principals, user_identities,"
                                                    + "  owner_addresses, owner_principal, owner_identities)"
                                                    + " VALUES(:url, :has_access_control, :user_privileges,"
                                                    + " :user_addresses, :user_principals, :user_identities,"
                                                    + " :owner_addresses, :owner_principal, :owner_identities)");
        this.mUpdateCalendarEntry = createStatement(this.mDB,
                                                    "UPDATE acl_calendar_entries"
                                                    + " SET has_access_control = :has_access_control,"
                                                    + "        user_privileges = :user_privileges,"
                                                    + "         user_addresses = :user_addresses,"
                                                    + "        user_principals = :user_principals,"
                                                    + "        user_identities = :user_identities,"
                                                    + "        owner_addresses = :owner_addresses,"
                                                    + "        owner_principal = :owner_principal,"
                                                    + "       owner_identities = :owner_identities"
                                                    + " WHERE url = :url");
        this.mDeleteCalendarEntry = createStatement(this.mDB, "DELETE FROM acl_calendar_entries WHERE url = :url");

        /* item entries */
        this.mSelectItemEntry = createStatement(this.mDB,
                                                "SELECT user_privileges FROM acl_item_entries"
                                                + " WHERE url = :url");
        this.mInsertItemEntry = createStatement(this.mDB,
                                                "INSERT INTO acl_item_entries"
                                                + " (url, user_privileges)"
                                                + " VALUES(:url, :user_privileges)");
        this.mUpdateItemEntry = createStatement(this.mDB,
                                                "UPDATE acl_item_entries"
                                                + " SET user_privileges = :user_privileges"
                                                + " WHERE url = :url");
        this.mDeleteItemEntry = createStatement(this.mDB,
                                                "DELETE FROM acl_item_entries"
                                                + " WHERE url = :url");
        this.mDeleteItemEntriesLike = createStatement(this.mDB,
                                                      "DELETE FROM acl_item_entries"
                                                      + " WHERE url LIKE :url");
    },

    getACLMeta: function CalDAVACLOfflineManager_getACLMeta(key) {
        let value = null;
        this.mGetACLMeta.params.key = key;
        try {
            this.mGetACLMeta.step();
            value = this.mGetACLMeta.row.value;
        }
        catch(e) {
        }
        finally {
            this.mGetACLMeta.reset();
        };

        return value;
    },
    setACLMeta: function CalDAVACLOfflineManager_getACLMeta(key, value) {
        if (value === null) {
            this.deleteACLMeta(key);
        }
        else {
            let initialValue = this.getACLMeta(key);
            if (initialValue === null) {
                this.mInsertACLMeta(key, value);
            }
            else {
                this.mUpdateACLMeta(value, key);
            }
        }
    },
    deleteACLMeta: function CalDAVACLOfflineManager_deleteACLMeta(key) {
        this.mDeleteACLMeta(key);
    },

    _parseStringArray: function CalDAVACLOfflineManager__parseStringArray(data) {
        let result;
        if (data.length > 0) {
            result = data.split("\u001A");
        }
        else {
            result = [];
        }

        return result;
    },

    _deserializeIdentities: function CalDAVACLOfflineManager__deserializeIdentities(mgr, calendar, data, entry) {
        let dataArray = this._parseStringArray(data);
        let identities = [];
        for each (let data in dataArray) {
            if (data && data.length > 0) {
                let dict = JSON.parse(data);
                mgr._appendIdentity(identities, dict["displayName"], dict["address"], entry);
            }
        }
        return identities;
    },

    getCalendarEntry: function CalDAVACLOfflineManager_getCalendarEntry(mgr, calendar, listener) {
        let url = fixURL(calendar.uri.spec);
        this.mSelectCalendarEntry.params.url = url;
        let entry = null;
        try {
            if (this.mSelectCalendarEntry.step()) {
                let row = this.mSelectCalendarEntry.row;
                entry = new CalDAVAclCalendarEntry(calendar);
                entry.hasAccessControl = (row.has_access_control == 1);
                if (entry.hasAccessControl) {
                    entry.userPrivileges = this._parseStringArray(row.user_privileges);
                    entry.userAddresses = this._parseStringArray(row.user_addresses);
                    entry.userPrincipals = this._parseStringArray(row.user_principals);
                    entry.ownerAddresses = this._parseStringArray(row.owner_addresses);
                    entry.ownerPrincipal = row.owner_principal;
                    entry.userIdentities = this._deserializeIdentities(mgr, calendar, row.user_identities, entry);
                    entry.ownerIdentities = this._deserializeIdentities(mgr, calendar, row.owner_identities, entry);
                }
            }
        }
        catch(e) {
            dump("getCalendarEntry: " + e + "\n:line: " +  e.lineNumber + "\n");
        }
        finally {
            this.mSelectCalendarEntry.reset();
        }
        listener.onOperationComplete(calendar, (entry ? Components.results.NS_OK : Components.results.NS_ERROR_FAILURE), entry);
    },

    _serializeStringArray: function CalDAVACLOfflineManager__serializeStringArray(strings) {
        let serialized = "";
        if (strings) {
            serialized = strings.join("\u001A");
        }

        return serialized;
    },

    _serializeIdentity: function CalDAVACLOfflineManager__serializeIdentity(identity) {
        let data = { "displayName": identity.fullName,
                     "address": identity.email };
        return JSON.stringify(data);
    },
    _serializeIdentities: function CalDAVACLOfflineManager__serializeIdentities(identities) {
        let strings = [];
        if (identities) {
            for each (let identity in identities) {
                strings.push(this._serializeIdentity(identity));
            }
        }

        return this._serializeStringArray(strings);
    },

    setCalendarEntry: function CalDAVACLOfflineManager_setCalendarEntry(calendar, entry, listener) {
        // dump("setCalendarEntry\n");
        let url = fixURL(calendar.uri.spec);
        let queries = [ this.mInsertCalendarEntry, this.mUpdateCalendarEntry ];
        let errors = 0;
        for each (let query in queries) {
            dump("  query: " + query +"\n");
            let params = query.params;
            params.url = url;
            params.has_access_control = (entry.hasAccessControl ? 1 : 0);
            if (entry.hasAccessControl) {
                // dump("has access control...\n");
                params.user_privileges = this._serializeStringArray(entry.userPrivileges);
                params.user_addresses = entry.userAddresses.join("\u001A");
                params.user_principals = this._serializeStringArray(entry.userPrincipals);
                params.user_identities = this._serializeIdentities(entry.userIdentities);
                params.owner_addresses = this._serializeStringArray(entry.ownerAddresses);
                params.owner_principal = entry.ownerPrincipal;
                params.owner_identities = this._serializeIdentities(entry.ownerIdentities);
            }
            else {
                // dump("has NO access control...\n");
            }
            try {
                query.execute();
                break;
            }
            catch(e) {
                dump("error: "  + e +  "\n");
                errors++;
            }
            finally {
                query.reset();
            }
        }
        // dump("acl-db-manager: saved calendar entry, errors = "  + errors + "\n");
        if (listener) {
            listener.onOperationComplete(calendar,
                                         (errors == queries.length
                                          ? Components.results.NS_ERROR_FAILURE
                                          : Components.results.NS_OK),
                                         entry);
        }
    },

    getItemEntry: function CalDAVACLOfflineManager_getItemEntry(calEntry, url, listener) {
        if (!calEntry.hasAccessControl) {
            dump("No ACL handling -> no cache save required\n");
            listener.onOperationComplete(url, Components.results.NS_ERROR_FAILURE, null);
            return;
        }
        if (calEntry.userIsOwner) {
            dump("User is owner -> no cache save required\n");
            listener.onOperationComplete(url, Components.results.NS_ERROR_FAILURE, null);
            return;
        }

        this.mSelectItemEntry.params.url = url;
        let entry = null;
        try {
            if (this.mSelectItemEntry.step()) {
                let row = this.mSelectItemEntry.row;
                entry = new CalDAVAclItemEntry(calEntry, url);
                entry.userPrivileges = this._parseStringArray(row.user_privileges);
            }
        }
        catch(e) {
            dump("getItemEntry: " + e + "\n:line: " +  e.lineNumber + "\n");
        }
        finally {
            this.mSelectItemEntry.reset();
        }
        listener.onOperationComplete(url, (entry ? Components.results.NS_OK : Components.results.NS_ERROR_FAILURE), entry);
    },
    setItemEntry: function CalDAVACLOfflineManager_setItemEntry(itemEntry, listener) {
        // dump("setItemEntry\n");
        let url = fixURL(itemEntry.parentCalendarEntry.calendar.uri.spec) + itemEntry.url;
        if (!itemEntry.parentCalendarEntry.hasAccessControl) {
            dump("No ACL handling -> no cache save required\n");
            listener.onOperationComplete(url, Components.results.NS_ERROR_FAILURE, null);
            return;
        }
        if (itemEntry.parentCalendarEntry.userIsOwner) {
            dump("User is owner -> no cache save required\n");
            listener.onOperationComplete(url, Components.results.NS_ERROR_FAILURE, null);
            return;
        }

        let queries = [ this.mInsertItemEntry, this.mUpdateItemEntry ];
        let errors = 0;

        for each (let query in queries) {
            let params = query.params;
            params.url = url;
            params.user_privileges = this._serializeStringArray(itemEntry.userPrivileges);
            try {
                query.execute();
                break;
            }
            catch(e) {
                errors++;
            }
            finally {
                query.reset();
            }
        }
        // dump("acl-db-manager: saved item entry, errors = "  + errors + "\n");
        if (listener) {
            listener.onOperationComplete(url,
                                         (errors == queries.length
                                          ? Components.results.NS_ERROR_FAILURE
                                          : Components.results.NS_OK),
                                         itemEntry);
        }
    },

    dropCalendarEntry: function CalDAVACLOfflineManager_dropCalendarEntry(url) {
        this.mDeleteItemEntriesLike(url + "%");
        this.mDeleteCalendarEntry(url);;
    }
};

/* CalDAVACLManager */
function CalDAVACLManager() {
    this.calendars = {};
    this.pendingCalendarOperations = {};
    this.pendingItemOperations = {};
    this.identityCount = 0;
    this.accountMgr = null;
    this.mOfflineManager = new CalDAVACLOfflineManager();
}

function xmlEscape(text) {
    return text.replace("&", "&amp;", "g").replace("<", "&lt;", "g");
}

function xmlUnescape(text) {
    let s = String(text).replace(/&lt;/g, "<", "g");
    s = s.replace(/&gt;/g, ">", "g");
    s = s.replace(/&amp;/g, "&",  "g");

    return s;
}

function statusCode(status) {
    let code = -1;

    if (status.indexOf("HTTP/1.1") == 0) {
        let words = status.split(" ");
        code = parseInt(words[1]);
    }

    return code;
}

function cloneData(oldData) {
    if (!oldData) {
        throw("No data to clone");
    }

    let newData = {};
    for (let k in oldData) {
        newData[k] = oldData[k];
    }

    return newData;
}

CalDAVACLManager.prototype = {
    mOfflineManager: null,
    calendars: null,
    identityCount: 0,
    accountMgr: null,
    pendingCalendarOperations: null,
    pendingItemOperations: null,

    get isOffline() {
        return getIOService().offline;
    },

    getCalendarEntry: function getCalendarEntry(calendar, listener) {
        if (!calendar.uri) {
            dump("fixURL: no URL! - backtrace\n" + STACK());
        }

        let url = fixURL(calendar.uri.spec);

        let entry = this.calendars[url];
        if (entry) {
            this._notifyListenerSuccess(listener, calendar, entry);
            return;
        }

        let pendingData = { calendar: calendar, listener: listener };
        if (this.pendingCalendarOperations[url]) {
            this.pendingCalendarOperations[url].push(pendingData);
            return;
        }

        this.pendingCalendarOperations[url] = [pendingData];
        let this_ = this;
        let opListener = {
            onGetResult: function(opCalendar, opStatus, opItemType, opDetail, opCount, opItems) {
                ASSERT(false, "unexpected!");
            },
            onOperationComplete: function(opCalendar, opStatus, opType, opId, opDetail) {
                let aEntry;
                if (Components.isSuccessCode(opStatus)) {
                    // dump("acl-manager: we received a valid calendar entry, we cache it\n");
                    aEntry = opDetail;
                    this_.calendars[url] = aEntry;
                }
                else {
                    // dump("acl-manager: we did not receive a valid calendar entry, we FAKE it\n");
                    aEntry = this_._makeFallbackCalendarEntry(calendar);
                }
                for each (let data in this_.pendingCalendarOperations[url]) {
                    this_._notifyListenerSuccess(data.listener, data.calendar, aEntry);
                }
                delete this_.pendingCalendarOperations[url];
            }
        };

        this._queryCalendarEntry(calendar, opListener);
    },

    /* We produce a "fallback" entry when we don't have any means of obtaining the required info, whether online or not.
     * We then assume that ACL are not supported. */
    _makeFallbackCalendarEntry: function _makeOfflineCalendarEntry(calendar) {
        dump("acl-manager: making fallback calendar entry\n");
        let offlineEntry = new CalDAVAclCalendarEntry(calendar);
        offlineEntry.hasAccessControl = false;
        if (!this.accountMgr)
            this._initAccountMgr();
        let defaultAccount = this.accountMgr.defaultAccount;
        let identity = defaultAccount.defaultIdentity;
        if (identity != null) {
            offlineEntry.userAddresses = ["mailto:" + identity.email];
            offlineEntry.userIdentities = [identity];
            offlineEntry.ownerIdentities = [identity];
        }

        return offlineEntry;
    },

    getItemEntry: function getItemEntry(calendar, itemURL, listener) {
        let this_ = this;
        let opListener = {
            onGetResult: function(opCalendar, opStatus, opItemType, opDetail, opCount, opItems) {
                ASSERT(false, "unexpected!");
            },
            onOperationComplete: function(opCalendar, opStatus, opType, opId, opDetail) {
                if (Components.isSuccessCode(opStatus)) {
                    let calEntry = opDetail;

                    let itemEntry = null;
                    if (!calEntry.hasAccessControl || calEntry.userIsOwner) {
                        dump("calEntry enables us to skip the querying of the item entry\n");
                        /* In these case, we do not query the offline cache
                         neither the calendar collection because we know it's
                         useless. */
                        itemEntry = this_._makeFallbackItemEntry(calEntry, itemURL);
                    }
                    else {
                        itemEntry = calEntry.entries[itemURL];
                    }
                    if (itemEntry) {
                        listener.onOperationComplete(calendar, Components.results.NS_OK,
                                                     Components.interfaces.calIOperationListener.GET,
                                                     null,
                                                     itemEntry);
                        return;
                    }
                    this_._createItemEntry(calEntry, itemURL, listener);
                }
            }
        };
        this.getCalendarEntry(calendar, opListener);
    },
    _createItemEntry: function _createItemEntry(calEntry, itemURL, listener) {
        let pendingData = { calendar: calEntry.calendar, listener: listener, itemURL: itemURL };
        if (this.pendingItemOperations[itemURL]) {
            this.pendingItemOperations[itemURL].push(pendingData);
            return;
        }

        this.pendingItemOperations[itemURL] = [pendingData];

        let this_ = this;
        let itemOpListener = {
            onGetResult: function(opCalendar, opStatus, opItemType, opDetail, opCount, opItems) {
                ASSERT(false, "unexpected!");
            },
            onOperationComplete: function(opCalendar, opStatus, opType, opId, opDetail) {
                /* itemEntry = opDetail */
                let aEntry;
                if (Components.isSuccessCode(opStatus)) {
                    aEntry = opDetail;
                    calEntry.entries[itemURL] = aEntry;
                }
                else {
                    // dump("acl-manager: we did not receive a valid item entry, we FAKE it\n");
                    aEntry = this_._makeFallbackItemEntry(calEntry, itemURL);
                }

                for each (let data in this_.pendingItemOperations[itemURL]) {
                    let aListener = data["listener"];
                    aListener.onOperationComplete(data["calendar"], Components.results.NS_OK,
                                                  Components.interfaces.calIOperationListener.GET,
                                                  data["itemURL"],
                                                  aEntry);
                }
                delete this_.pendingItemOperations[itemURL];
            }
        };

        this._queryItemEntry(calEntry, itemURL, itemOpListener);
    },
    _makeFallbackItemEntry: function _makeOfflineCalendarEntry(calEntry, itemURL) {
        let offlineEntry = new CalDAVAclItemEntry(calEntry, itemURL);

        return offlineEntry;
    },

    onDAVQueryComplete: function onDAVQueryComplete(status, url, headers, response, data) {
        /* Warning, the url returned as parameter is not always the calendar URL
         since we also query user principals and items. */
        if (status > 498) {
            dump("an anomally occured during request '" + data.method + "'.\n" + "  Code: " + status + "\n");
            data.listener.onOperationComplete(data.calendar,
                                              Components.results.NS_ERROR_FAILURE,
                                              Components.interfaces.calIOperationListener.GET,
                                              null, null);
        }
        else if (status > 399) {
            this._markWithNoAccessControl(data);
        }
        else {
            if (data.method == "acl-options") {
                this._optionsCallback(status, url, headers, response, data);
            }
            else if (data.method == "collection-set") {
                this._collectionSetCallback(status, url, headers, response, data);
            }
            else if (data.method == "principal-match") {
                this._principalMatchCallback(status, url, headers, response, data);
            }
            else if (data.method == "user-address-set") {
                this._userAddressSetCallback(status, url, headers, response, data);
            }
            else if (data.method == "item-privilege-set") {
                this._itemPrivilegeSetCallback(status, url, headers, response, data);
            }
        }
    },

    _notifyListenerSuccess: function _notifyListenerSuccess(listener, calendar, entry) {
        listener.onOperationComplete(calendar, Components.results.NS_OK,
                                     Components.interfaces.calIOperationListener.GET,
                                     null,
                                     entry);
    },
    _markWithNoAccessControl: function _markWithNoAccessControl(data) {
        let entry = data.entry;
        entry.hasAccessControl = false;
        this.mOfflineManager.setCalendarEntry(data.calendar, entry, null);
        this._notifyListenerSuccess(data["listener"], data["calendar"], entry);
    },
    _queryCalendarEntry: function _queryCalendar(calendar, listener) {
        let this_ = this;
        let offlineListener = {
            onOperationComplete: function(opCalendar, opStatus, opEntry) {
                if (Components.isSuccessCode(opStatus)) {
                    dump("acl-manager: received calendar entry from db\n");
                    this_._notifyListenerSuccess(listener, opCalendar, opEntry);
                }
                else {
                    if (this_.isOffline) {
                        dump("acl-manager: we did not receive calendar entry from db + offline -> error\n");
                        listener.onOperationComplete(opCalendar,
                                                     Components.results.NS_ERROR_FAILURE,
                                                     Components.interfaces.calIOperationListener.GET,
                                                     null, null);
                    }
                    else {
                        dump("acl-manager: we did not receive calendar entry from db -> online query\n");
                        this_._queryOnlineCalendarEntry(calendar, listener);
                    }
                }
            }
        };
        this.mOfflineManager.getCalendarEntry(this, calendar, offlineListener);
    },
    _queryOnlineCalendarEntry: function _queryCalendar(calendar, listener) {
        /* Steps:
         * 1. acl-options
         * 2. collection-set
         * 3. user-address-set (owner) or markWithNoAccessControl
         * 4. principal-match
         * 5. user-address-set (user)
         */

        let entry = new CalDAVAclCalendarEntry(calendar);
        let data = {method: "acl-options", calendar: calendar, entry: entry, listener: listener};
        let url = fixURL(calendar.uri.spec);
        this.xmlRequest(url, "OPTIONS", null, null, data);
    },
    _optionsCallback: function _optionsCallback(status, url, headers, response, data) {
        let dav = headers["dav"];
        // dump("options callback: " + url +  " HTTP/1.1 " + status + "\n");
        // dump("headers:\n");
        // for (let k in headers)
        // dump("  " + k + ": " + headers[k] + "\n");
        let calURL = fixURL(url);
        // dump("dav: " + dav + "\n");
        if (dav && dav.indexOf("access-control") > -1) {
            let newData = cloneData(data);
            newData["entry"].hasAccessControl = true;
            let propfind = ("<?xml version='1.0' encoding='UTF-8'?>\n"
                            + "<D:propfind xmlns:D='DAV:'><D:prop><D:principal-collection-set/><D:owner/><D:current-user-privilege-set/></D:prop></D:propfind>");
            newData["method"] = "collection-set";
            this.xmlRequest(url, "PROPFIND", propfind,
                            {'content-type': "application/xml; charset=utf-8",
                             'depth': "0"},
                            newData);
        }
        else
            this._markWithNoAccessControl(data);
    },
    _collectionSetCallback: function _collectionSetCallback(status, url, headers,
                                                            response, data) {
        if (status == 207) {
            let calURL = fixURL(url);
            let xParser = Components.classes['@mozilla.org/xmlextras/domparser;1']
                                    .getService(Components.interfaces.nsIDOMParser);
            let queryDoc = xParser.parseFromString(response, "application/xml");
            let nodes = queryDoc.getElementsByTagNameNS("DAV:", "principal-collection-set");
            let address = "";
            if (nodes.length) {
                let node = nodes[0];
                let subnodes = node.childNodes;
                for (let i = 0; i < subnodes.length; i++) {
                    if (subnodes[i].nodeType
                        == Components.interfaces.nsIDOMNode.ELEMENT_NODE) {
                        let value = subnodes[i].childNodes[0].nodeValue;
                        if (value.indexOf("/") == 0) {
                            let clone = data["calendar"].uri.clone();
                            clone.path = value;
                            address = clone.spec;
                        }
                        else
                            address = value;
                    }
                }

                nodes = queryDoc.getElementsByTagNameNS("DAV:", "owner");
                if (nodes.length) {
                    //                     dump("owner nodes: " + nodes.length + "\n");
                    let subnodes = nodes[0].childNodes;
                    for (let i = 0; i < subnodes.length; i++) {
                        if (subnodes[i].nodeType
                            == Components.interfaces.nsIDOMNode.ELEMENT_NODE) {
                            let owner;
                            let value = subnodes[i].childNodes[0].nodeValue;
                            if (value.indexOf("/") == 0) {
                                let clone = data["calendar"].uri.clone();
                                clone.path = value;
                                owner = clone.spec;
                            }
                            else
                                owner = value;
                            let fixedURL = fixURL(owner);

                            let newData = cloneData(data);
                            newData["entry"].ownerPrincipal = fixedURL;
                            let propfind = ("<?xml version='1.0' encoding='UTF-8'?>\n"
                                            + "<D:propfind xmlns:D='DAV:' xmlns:C='urn:ietf:params:xml:ns:caldav'><D:prop><C:calendar-user-address-set/><D:displayname/></D:prop></D:propfind>");
                            newData["method"] = "user-address-set";
                            newData["who"] = "owner";
                            this.xmlRequest(fixedURL, "PROPFIND", propfind,
                                            {'content-type': "application/xml; charset=utf-8",
                                             'depth': "0"},
                                            newData);
                        }
                    }
                }
                if (address && address.length) {
                    let newData = cloneData(data);
                    newData["entry"].userPrivileges = this._parsePrivileges(queryDoc);
                    let report = ("<?xml version='1.0' encoding='UTF-8'?>\n"
                                  + "<D:principal-match xmlns:D='DAV:'><D:self/></D:principal-match>");
                    newData["method"] = "principal-match";
                    this.xmlRequest(address, "REPORT", report,
                                    {'depth': "0",
                                     'content-type': "application/xml; charset=utf-8" },
                                    newData);
                }
                else
                    this._markWithNoAccessControl(data);
            }
            else
                this._markWithNoAccessControl(data);
        }
    },
    _principalMatchCallback: function _principalMatchCallback(status, url, headers, response, data) {
        if (status == 207) {
            let xParser = Components.classes['@mozilla.org/xmlextras/domparser;1']
                                    .getService(Components.interfaces.nsIDOMParser);
            let queryDoc = xParser.parseFromString(response, "application/xml");
            let hrefs = queryDoc.getElementsByTagNameNS("DAV:", "href");
            let principals = [];

            data["entry"].userPrincipals = principals;
            for (let i = 0; i < hrefs.length; i++) {
                let href = "" + hrefs[i].childNodes[0].nodeValue;
                if (href.indexOf("/") == 0) {
                    let clone = data.calendar.uri.clone();
                    clone.path = href;
                    href = clone.spec;
                }

                let fixedURL = fixURL(href);
                let propfind = ("<?xml version='1.0' encoding='UTF-8'?>\n"
                                + "<D:propfind xmlns:D='DAV:' xmlns:C='urn:ietf:params:xml:ns:caldav'><D:prop><C:calendar-user-address-set/><D:displayname/></D:prop></D:propfind>");

                let newData = cloneData(data);
                newData["method"] = "user-address-set";
                newData["who"] = "user";
                this.xmlRequest(fixedURL, "PROPFIND", propfind,
                                {'content-type': "application/xml; charset=utf-8",
                                 'depth': "0"},
                                newData);
                principals.push(fixedURL);
            }
        }
        else if (status == 501) {
            dump("CalDAV: Server does not support ACLs\n");
            this._markWithNoAccessControl(data);
        }
    },
    _userAddressSetCallback: function _userAddressSetCallback(status, url, headers, response, data) {
        if (status == 207) {
            let entry = data["entry"];
            let xParser = Components.classes['@mozilla.org/xmlextras/domparser;1']
                                    .getService(Components.interfaces.nsIDOMParser);
            let queryDoc = xParser.parseFromString(response, "application/xml");

            let addressValues = this._parseCalendarUserAddressSet(queryDoc, data.calendar);

            let addressesKey = data.who + "Addresses";
            let identitiesKey = data.who + "Identities";

            //dump("url: " + url + " addressesKey: " + addressesKey + " identitiesKey: " + identitiesKey + "\n");

            let addresses = entry[addressesKey];
            if (!addresses) {
                addresses = [];
                entry[addressesKey] = addresses;
            }
            for (let address in addressValues) {
                if (addresses.indexOf(address) == -1) {
                    addresses.push(address);
                }
            }

            // dump("identities for calendar: " + data.calendar + "\n");
            // dump("  type: " + data.who + "\n");
            let identities = entry[identitiesKey];
            if (!identities) {
                identities = [];
                entry[identitiesKey] = identities;
            }

            let displayName = this._parsePrincipalDisplayName(queryDoc);
            if (displayName != null) {
                for (let address in addressValues) {
                    if (address.search("mailto:", "i") == 0) {
                        this._appendIdentity(identities, displayName,
                                             address.substr(7), entry);
                    }
                }
            }

            if (entry.nbrAddressSets) {
                this.mOfflineManager.setCalendarEntry(data["calendar"], entry, null);
                this._notifyListenerSuccess(data["listener"], data["calendar"], entry);
            } else {
                entry.nbrAddressSets = 1;
            }
        }
    },
    _initAccountMgr: function _initAccountMgr() {
        this.accountMgr = Components.classes["@mozilla.org/messenger/account-manager;1"]
                                    .getService(Components.interfaces.nsIMsgAccountManager);
        let defaultAccount = this.accountMgr.defaultAccount;

        let identities = this.accountMgr.allIdentities.QueryInterface(Components.interfaces.nsICollection);
        let values = [];
        let current = 0;
        let max = 0;

        // We get the identities we use for mail accounts. We also
        // get the highest key which will be used as the basis when
        // adding new identities (so we don't overwrite keys...)
        for (let i = identities.Count()-1; i >= 0; i--) {
            let identity = identities.GetElementAt(i).QueryInterface(Components.interfaces.nsIMsgIdentity);
            if (identity.key.indexOf("caldav_") == 0) {
                if (identity.email) {
                    values.push(identity.key);
                    current = parseInt(identity.key.substring(7));
                    if (current > max)
                        max = current;
                } else {
                    dump("CalDAVACLManager._initAccountMgr: removing stale"
                         + " identity '" + identity.key + "'\n");
                    defaultAccount.removeIdentity(identity);
                }
            }
        }

        // We now remove every other caldav_ pref other than the ones we
        // use in our mail accounts.
        let prefService = Components.classes["@mozilla.org/preferences-service;1"]
                                    .getService(Components.interfaces.nsIPrefService);
        let prefBranch = prefService.getBranch("mail.identity.");
        let prefs = prefBranch.getChildList("", {});
        for each (let pref in prefs) {
            if (pref.indexOf("caldav_") == 0) {
                let key = pref.substring(0, pref.indexOf("."));
                if (values.indexOf(key) < 0) {
                    dump("CalDAVACLManager._initAccountMgr: removing useless"
                         +" identity branch: '" + key + "'\n");
                    prefBranch.deleteBranch(key);
                }
            }
        }
        this.identityCount = max + 1;
    },
    _findIdentity: function _findIdentity(email, displayName) {
        let identity = null;
        let lowEmail = email.toLowerCase();
        let lowDisplayName = displayName.toLowerCase();

        let identities = this.accountMgr.allIdentities.QueryInterface(Components.interfaces.nsICollection);
        let i = 0;
        while (!identity && i < identities.Count()) {
            let currentIdentity = identities.GetElementAt(i)
                                            .QueryInterface(Components.interfaces.nsIMsgIdentity);
            if (currentIdentity.email.toLowerCase() == lowEmail
                && currentIdentity.fullName.toLowerCase() == lowDisplayName)
                identity = currentIdentity;
            else
                i++;
        }

        return identity;
    },
    _identitiesHaveEmail: function _identitiesHaveEmail(identities, email) {
        let haveEmail = false;
        let lowEmail = email.toLowerCase();

        let i = 0;
        while (!haveEmail && i < identities.length) {
            if (identities[i].email.toLowerCase() == lowEmail)
                haveEmail = true;
            else
                i++;
        }

        return haveEmail;
    },

    _appendIdentity: function _appendIdentity(identities, displayName, email, calendar) {
        if (!this.accountMgr)
            this._initAccountMgr();

        let newIdentity = this._findIdentity(email, displayName);
        if (!newIdentity) {
            newIdentity = Components.classes["@mozilla.org/messenger/identity;1"]
                                    .createInstance(Components.interfaces.nsIMsgIdentity);
            newIdentity.key = "caldav_" + this.identityCount;
            newIdentity.identityName = String(displayName + " <" + email + ">");
            newIdentity.fullName = String(displayName);
            newIdentity.email = String(email);

            // We add identities associated to this calendar to Thunderbird's
            // list of identities only if we are actually the owner of the calendar.
            if (calendar.userIsOwner) {
                this.accountMgr.defaultAccount.addIdentity(newIdentity);
            }
            this.identityCount++;
        }

        if (!this._identitiesHaveEmail(identities, email))
            identities.push(newIdentity);
    },
    _parseCalendarUserAddressSet: function _parseCalendarUserAddressSet(queryDoc, calendar) {
        let values = {};
        let nodes = queryDoc.getElementsByTagNameNS("urn:ietf:params:xml:ns:caldav",
                                                    "calendar-user-address-set");
        for (let i = 0; i < nodes.length; i++) {
            let childNodes = nodes[i].childNodes;
            for (let j = 0; j < childNodes.length; j++) {
                if (childNodes[j].nodeType
                    == Components.interfaces.nsIDOMNode.ELEMENT_NODE) {
                    let value = "" + childNodes[j].childNodes[0].nodeValue;
                    let address;
                    if (value.indexOf("/") == 0) {
                        let clone = calendar.uri.clone();
                        clone.path = value;
                        address = "" + clone.spec;
                    }
                    else
                        address = value;
                    values[address] = true;
                }
            }
        }

        return values;
    },
    _parsePrincipalDisplayName: function _parsePrincipalDisplayName(queryDoc) {
        let displayName;

        let nodes = queryDoc.getElementsByTagNameNS("DAV:", "displayname");
        if (nodes.length) {
            displayName = "";
            let childNodes = nodes[0].childNodes;
            // dump ( "childNodes: " + childNodes.length + "\n");
            for (let i = 0; i < childNodes.length; i++) {
                if (childNodes[i].nodeType
                    == Components.interfaces.nsIDOMNode.TEXT_NODE)
                    displayName += xmlUnescape(childNodes[i].nodeValue);
            }
        }
        else
            displayName = null;

        return displayName;
    },

    /* component controller */
    _queryItemEntry: function _queryItem(calEntry, itemURL, listener) {
        let this_ = this;
        let offlineListener = {
            onOperationComplete: function(aURL, opStatus, opEntry) {
                if (Components.isSuccessCode(opStatus)) {
                    dump("acl-manager: received item entry from db\n");
                    this_._notifyListenerSuccess(listener, calEntry.calendar, opEntry);
                }
                else {
                    if (this_.isOffline) {
                        dump("acl-manager: itemEntry not found in offline cache, faking it due to offline mode\n");
                        listener.onOperationComplete(calEntry.calendar,
                                                     Components.results.NS_ERROR_FAILURE,
                                                     Components.interfaces.calIOperationListener.GET,
                                                     null, null);
                    }
                    else {
                        dump("acl-manager: itemEntry not found in offline cache, querying it online...\n");
                        this_._queryOnlineItemEntry(calEntry, itemURL, listener);
                    }
                }
            }
        };
        let fullItemURL = fixURL(calEntry.calendar.uri.spec) + itemURL;
        this.mOfflineManager.getItemEntry(calEntry, fullItemURL, offlineListener);
    },

    _queryOnlineItemEntry: function _queryItem(calEntry, itemURL, listener) {
        let entry = new CalDAVAclItemEntry(calEntry, itemURL);
        let data = {calendar: calEntry.calendar, method: "item-privilege-set", entry: entry, listener: listener};

        let url = fixURL(calEntry.calendar.uri.spec) + itemURL;
        let propfind = ("<?xml version='1.0' encoding='UTF-8'?>\n"
                        + "<D:propfind xmlns:D='DAV:'><D:prop><D:current-user-privilege-set/></D:prop></D:propfind>");
        this.xmlRequest(url, "PROPFIND", propfind,
                        {'content-type': "application/xml; charset=utf-8",
                         'depth': "0"},
                        data);
    },
    _itemPrivilegeSetCallback: function
    _itemPrivilegeSetCallback(status, url, headers, response, data) {
        let xParser = Components.classes['@mozilla.org/xmlextras/domparser;1']
                                .getService(Components.interfaces.nsIDOMParser);
        let queryDoc = xParser.parseFromString(response, "application/xml");
        // dump("\n\n\nitem-privilege-set:\n" + response + "\n\n\n");

        data.entry.userPrivileges = this._parsePrivileges(queryDoc);
        this.mOfflineManager.setItemEntry(data["entry"]);
        this._notifyListenerSuccess(data["listener"], data["calendar"], data["entry"]);
    },
    _parsePrivileges: function _parsePrivileges(queryDoc) {
        let privileges = [];
        let nodes = queryDoc.getElementsByTagNameNS("DAV:", "privilege");
        for (let i = 0; i < nodes.length; i++) {
            let subnodes = nodes[i].childNodes;
            for (let j = 0; j < subnodes.length; j++)
                if (subnodes[j].nodeType
                    == Components.interfaces.nsIDOMNode.ELEMENT_NODE) {
                    let ns = subnodes[j].namespaceURI;
                    let tag = subnodes[j].localName;
                    let privilege = "{" + ns + "}" + tag;
                    // dump(arguments.callee.caller.name + " privilege: " + privilege + "\n");
                    privileges.push(privilege);
                }
        }

        return privileges;
    },
    xmlRequest: function xmlRequest(url, method, body, headers, data) {
        let channel = getIOService().newChannelFromURI(makeURL(url));
        let httpChannel = channel.QueryInterface(Components.interfaces.nsIHttpChannel);
        httpChannel.loadFlags |= Components.interfaces.nsIRequest.LOAD_BYPASS_CACHE;

        let callbacks = {};
        callbacks.getInterface = cal.InterfaceRequestor_getInterface;
        httpChannel.notificationCallbacks = callbacks;

        httpChannel.setRequestHeader("accept", "text/xml", false);
        httpChannel.setRequestHeader("accept-charset", "utf-8,*;q=0.1", false);
        if (headers) {
            for (let header in headers) {
                httpChannel.setRequestHeader(header, headers[header], true);
            }
        }

        if (body) {
            httpChannel = httpChannel.QueryInterface(Components.interfaces.nsIUploadChannel);
            let converter = Components.classes["@mozilla.org/intl/scriptableunicodeconverter"]
                                      .createInstance(Components.interfaces.nsIScriptableUnicodeConverter);
            converter.charset = "UTF-8";
            let stream = converter.convertToInputStream(body);
            let contentType = headers["content-type"];
            if (!contentType) {
                contentType = "text/plain; charset=utf-8";
            }
            httpChannel.setUploadStream(stream, contentType, -1);
        }

        let this_ = this;
        let listener = {};
        listener.onStreamComplete = function (aLoader, aContext, aStatus, aResultLength, aResult) {
            let request = aLoader.request.QueryInterface(Components.interfaces.nsIHttpChannel);
            let status;
            try {
                status = request.responseStatus;
                if (status == 0) {
                    status = 499;
                }
            }
            catch(e) {
                dump("CalDAVACLManager: trapped exception: "
                     + e + "\n");
                status = 499;
            }
            let responseText = "";
            let responseHeaders = {};
            try {
                if (status == 499) {
                    dump("xmlRequest: received status 499 for url: " + url + "; method: " + method + "\n");
                }
                else {
                    if (aResultLength > 0) {
                        let resultConverter = Components.classes["@mozilla.org/intl/scriptableunicodeconverter"]
                                                        .createInstance(Components.interfaces.nsIScriptableUnicodeConverter);
                        resultConverter.charset ="UTF-8";
                        responseText = resultConverter.convertFromByteArray(aResult, aResultLength);
                    }
                    let visitor = {};
                    visitor.visitHeader = function(aHeader, aValue) {
                        let key = aHeader.toLowerCase();
                        responseHeaders[key] = aValue.replace(/(^[ 	]+|[ 	]+$)/, "", "g");
                    };
                    request.visitResponseHeaders(visitor);
                }
            }
            catch(e) {
                dump("CAlDAVAclManager.js: an exception occured\n" + e + "\n"
                     + e.fileName + ":" + e.lineNumber + "\n"
                     + "url: " + request.url + "\n");
            }
            this_.onDAVQueryComplete(status, url, responseHeaders, responseText, data);
        };

        let loader = Components.classes["@mozilla.org/network/stream-loader;1"]
                               .createInstance(Components.interfaces.nsIStreamLoader);
        loader.init(listener);
        /* If set too early, the method can change to "PUT" when initially set to "PROPFIND"... */
        httpChannel.requestMethod = method;
        httpChannel.asyncOpen(loader, httpChannel);
    },

    refresh: function refresh(url) {
        let realURL = fixURL(url);
        this.mOfflineManager.dropCalendarEntry(realURL);
        let cachedEntry = this.calendars[realURL];
        if (cachedEntry) {
            /* We ensure any instance that would still exist are invalidated. */
            cachedEntry.valid = false;
            delete this.calendars[realURL];
        }
    },

    QueryInterface: function(aIID) {
        if (!aIID.equals(Components.interfaces.nsISupports)
            && !aIID.equals(Components.interfaces.calICalDAVACLManager))
            throw Components.results.NS_ERROR_NO_INTERFACE;

        return this;
    }
};

function CalDAVAclCalendarEntry(calendar) {
    this.calendar = calendar;
    this.uri = calendar.uri;
    this.entries = {};
    this.hasAccessControl = false;
    this.mValid = true;
}

CalDAVAclCalendarEntry.prototype = {
    uri: null,
    entries: null,
    mValid: false,

    set valid(newValid) {
        this.mValid = newValid;
    },
    get valid() {
        return this.mValid;
    },
    assertValid: function assertValid() {
        if (!this.mValid) {
            throw "This Calendar ACL entry has been invalidated, most likely by a refresh.";
        }
    },

    get userIsOwner() {
        this.assertValid();

        let result = false;

        let i = 0;

        if (this.hasAccessControl) {
            while (!result && typeof(this.userPrincipals) != "undefined" && i < this.userPrincipals.length) {
                //                 dump("user: " + this.userPrincipals[i] + "\n");
                if (this.userPrincipals[i] == this.ownerPrincipal)
                    result = true;
                else
                    i++;
            }
        }
        else
            result = true;

        return result;
    },
    get userCanAddItems() {
        this.assertValid();

        // dump("has access control: " + this.hasAccessControl + "\n");
        return (!this.hasAccessControl
                || (this.userPrivileges.indexOf("{DAV:}bind")
                    > -1));
    },
    get userCanDeleteItems() {
        this.assertValid();

        // dump("has access control: " + this.hasAccessControl + "\n");
        // if (this.userPrivileges)
        // dump("indexof unbind: "
        // + this.userPrivileges.indexOf("{DAV:}unbind") + "\n");
        return (!this.hasAccessControl
                || (this.userPrivileges.indexOf("{DAV:}unbind")
                    > -1));
    },

    getUserAddresses: function getUserAddresses(outCount, outAddresses) {
        this.assertValid();

        if (this.userAddresses) {
            outCount.value = this.userAddresses.length;
            outAddresses.value = this.userAddresses;
        }
        else {
            outCount.value = 0;
            outAddresses.value = [];
        }
    },
    getUserIdentities: function getUserAddresses(outCount, outIdentities) {
        this.assertValid();

        if (this.userIdentities) {
            outCount.value = this.userIdentities.length;
            outIdentities.value = this.userIdentities;
        }
        else {
            outCount.value = 0;
            outIdentities.value = [];
        }
    },
    getOwnerIdentities: function getUserAddresses(outCount, outIdentities) {
        this.assertValid();

        if (this.ownerIdentities) {
            outCount.value = this.ownerIdentities.length;
            outIdentities.value = this.ownerIdentities;
        }
        else {
            outCount.value = 0;
            outIdentities.value = [];
        }
    },

    QueryInterface: function(aIID) {
        if (!aIID.equals(Components.interfaces.nsISupports)
            && !aIID.equals(Components.interfaces.calICalDAVACLCalendarEntry))
            throw Components.results.NS_ERROR_NO_INTERFACE;

        return this;
    }
};

function CalDAVAclItemEntry(calEntry, url) {
    this.parentCalendarEntry = calEntry;
    this.url = url;
}

CalDAVAclItemEntry.prototype = {
    parentCalendarEntry: null,
    url: null,
    userPrivileges: null,

    get userIsOwner() {
        return this.parentCalendarEntry.userIsOwner;
    },
    get userCanModify() {
        // dump("userCanModify\n");
        // dump("this.url: " + this.url + "\n");
        // dump("this.userPrivileges: " + this.userPrivileges + "\n");
        // dump("this.parentCalendarEntry.userPrivileges: "
        // + this.parentCalendarEntry.userPrivileges + "\n");

        if (!this.parentCalendarEntry.hasAccessControl) {
            dump("has not access control -> true\n");
            return true;
        }
        if (this.parentCalendarEntry.userIsOwner) {
            dump("user is owner -> true\n");
            return true;
        }

        let index = (this.url
                     ? this.userPrivileges.indexOf("{DAV:}write")
                     : this.parentCalendarEntry.userPrivileges.indexOf("{DAV:}bind"));
        return (index > -1);
    },
    get userCanRespond() {
        // dump("userCanRespond\n");
        return (!this.parentCalendarEntry.hasAccessControl
                || this.parentCalendarEntry.userIsOwner
                || (this.userPrivileges
                        .indexOf("{urn:inverse:params:xml:ns:inverse-dav}respond-to-component")
                    > -1));
    },
    get userCanViewAll() {
        // dump("userCanViewAll\n");
        return (!this.parentCalendarEntry.hasAccessControl
                || this.parentCalendarEntry.userIsOwner
                ||  (this.userPrivileges
                         .indexOf("{urn:inverse:params:xml:ns:inverse-dav}view-whole-component")
                     > -1));
    },
    get userCanViewDateAndTime() {
        // dump("userCanViewDateAndTime\n");
        return (!this.parentCalendarEntry.hasAccessControl
                || this.parentCalendarEntry.userIsOwner
                || (this.userPrivileges
                        .indexOf("{urn:inverse:params:xml:ns:inverse-dav}view-date-and-time")
                    > -1));
    },

    QueryInterface: function(aIID) {
        if (!aIID.equals(Components.interfaces.nsISupports)
            && !aIID.equals(Components.interfaces.calICalDAVACLItemEntry))
            throw Components.results.NS_ERROR_NO_INTERFACE;

        return this;
    }
};
