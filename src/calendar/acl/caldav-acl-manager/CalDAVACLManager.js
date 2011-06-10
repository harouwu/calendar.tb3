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

function xmlEscape(text) {
    return text.replace("&", "&amp;", "g").replace("<", "&lt;", "g");
}

function xmlUnescape(text) {
    let s = (""+text).replace(/&lt;/g, "<", "g");
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

function CalDAVACLManager() {
    this.calendars = {};
    this.identityCount = 0;
    this.accountMgr = null;
}

CalDAVACLManager.prototype = {
    calendars: null,
    identityCount: 0,
    accountMgr: null,

    get isOffline() {
        return getIOService().offline;
    },

    getCalendarEntry: function getCalendarEntry(calendar, listener) {
        if (!calendar.uri) {
            dump("fixURL: no URL! - backtrace\n" + STACK());
        }

        let url = fixURL(calendar.uri.spec);

        if (this.isOffline) {
            let entry = this._makeOfflineCalendarEntry(calendar);
            this._notifyListenerSuccess(listener, calendar, entry);

            return;
        }

        let entry = this.calendars[url];
        if (entry) {
            this._notifyListenerSuccess(listener, calendar, entry);
            return;
        }

        let this_ = this;
        let opListener = {
            onGetResult: function(opCalendar, opStatus, opItemType, opDetail, opCount, opItems) {
                ASSERT(false, "unexpected!");
            },
            onOperationComplete: function(opCalendar, opStatus, opType, opId, opDetail) {
                /* calentry = opDetail */
                this_.calendars[url] = opDetail;
                this_._notifyListenerSuccess(listener, calendar, opDetail);
            }
        };

        this._queryCalendarEntry(calendar, opListener);
    },
    _makeOfflineCalendarEntry: function _makeOfflineCalendarEntry(calendar) {
        let offlineEntry = new CalDAVAclCalendarEntry(calendar);
        offlineEntry.hasAccessControl = false;
        if (!this.accountMgr)
            this._initAccountMgr();
        let defaultAccount = this.accountMgr.defaultAccount;
        let identity = defaultAccount.defaultIdentity;
        offlineEntry.userAddresses = ["mailto:" + identity.email];
        offlineEntry.userIdentities = [identity];
        offlineEntry.ownerIdentities = [identity];

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
                    /* calentry = opDetail */
                    let calEntry = opDetail;

                    if (this_.isOffline) {
                        let entry = this_._makeOfflineItemEntry(calEntry, itemURL);
                        this_._notifyListenerSuccess(listener, calendar, entry);

                        return;
                    }

                    let itemEntry = calEntry.entries[itemURL];
                    if (itemEntry) {
                        listener.onOperationComplete(calendar, Components.results.NS_OK,
                                                     Components.interfaces.calIOperationListener.GET,
                                                     null,
                                                     itemEntry);
                    }
                    else {
                        this_._createItemEntry(calEntry, itemURL, listener);
                    }
                }
            }
        };
        this.getCalendarEntry(calendar, opListener);
    },
    _createItemEntry: function _createItemEntry(calEntry, itemURL, listener) {
        let itemOpListener = {
            onGetResult: function(opCalendar, opStatus, opItemType, opDetail, opCount, opItems) {
                ASSERT(false, "unexpected!");
            },
            onOperationComplete: function(opCalendar, opStatus, opType, opId, opDetail) {
                /* itemEntry = opDetail */
                calEntry.entries[itemURL] = opDetail;
                listener.onOperationComplete(calEntry.calendar, Components.results.NS_OK,
                                             Components.interfaces.calIOperationListener.GET,
                                             itemURL,
                                             opDetail);
            }
        };

        this._queryItemEntry(calEntry, itemURL, itemOpListener);
    },
    _makeOfflineItemEntry: function _makeOfflineCalendarEntry(calEntry, itemURL) {
        let offlineEntry = new CalDAVAclItemEntry(calEntry, itemURL);

        return offlineEntry;
    },

    onDAVQueryComplete: function onDAVQueryComplete(status, url, headers,  response, data) {
        // dump("callback for method: " + data.method + "\n");
        /* Warning, the url returned as parameter is not always the calendar URL
         since we also query user principals and items. */
        let fixedURL = fixURL(data.calendar.uri.spec);
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
        this._notifyListenerSuccess(data.listener, data.calendar, entry);
    },
    _queryCalendarEntry: function _queryCalendar(calendar, listener) {
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
                             'depth': "0"}, newData);
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
    _userAddressSetCallback: function _collectionSetCallback(status, url, headers,
                                                             response, data) {
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
            if (calendar.userIsOwner()) {
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
        let entry = new CalDAVAclItemEntry(calEntry, itemURL);
        let data = {method: "item-privilege-set", entry: entry, listener: listener};

        // dump("queryCompoennt\n");
        let propfind = ("<?xml version='1.0' encoding='UTF-8'?>\n"
                        + "<D:propfind xmlns:D='DAV:'><D:prop><D:current-user-privilege-set/></D:prop></D:propfind>");
        this.xmlRequest(url, "PROPFIND", propfind, data);
    },
    _itemPrivilegeSetCallback: function
    _itemPrivilegeSetCallback(status, url, headers, response, data) {
        let xParser = Components.classes['@mozilla.org/xmlextras/domparser;1']
                                .getService(Components.interfaces.nsIDOMParser);
        let queryDoc = xParser.parseFromString(response, "application/xml");
        // dump("\n\n\nitem-privilege-set:\n" + response + "\n\n\n");

        data.entry.userPrivileges = this._parsePrivileges(queryDoc);
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
    xmlRequest: function xmlRequest(url, method, parameters, headers, data) {
        let request = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"]
                                .createInstance(Components.interfaces.nsIJSXMLHttpRequest);
        //         dump("method: " + method + "\n");
        //         dump("url: " + url + "\n");
        request.open(method, url, true);
        if (headers) {
            for (let header in headers) {
                request.setRequestHeader(header, headers[header]);
            }
        }
        request.url = fixURL(url);
        request.client = this;
        request.method = method;
        request.callbackData = data;

        request.onreadystatechange = function() {
            if (request.readyState == 4) {
                if (request.client) {
                    let status;
                    let textHeaders;
                    try {
                        status = request.status;
                        if (status == 0) {
                            status = 499;
                        }
                        else {
                            textHeaders = request.getAllResponseHeaders();
                        }
                    }
                    catch(e) {
                        dump("CalDAVACLManager: trapped exception: "
                             + e + "\n");
                        status = 499;
                        textHeaders = "";
                    }
                    let responseText;
                    let headers = {};
                    try {
                        if (status == 499) {
                            responseText = "";
                            dump("xmlRequest: received status 499 for url: "
                                 + request.url + "; method: " + method + "\n");
                        }
                        else {
                            responseText = request.responseText;
                            let headersArray = textHeaders.split("\n");
                            for (let i = 0; i < headersArray.length; i++) {
                                let line = headersArray[i].replace(/\r$/, "", "g");
                                if (line.length) {
                                    let elems = line.split(":");
                                    let key = elems[0].toLowerCase();
                                    let value = elems[1].replace(/(^[         ]+|[         ]+$)/, "", "g");
                                    headers[key] = value;
                                }
                            }
                        }
                    }
                    catch(e) {
                        dump("CAlDAVAclManager.js: an exception occured\n" + e + "\n"
                             + e.fileName + ":" + e.lineNumber + "\n"
                             + "url: " + request.url + "\n");
                    }
                    request.client.onDAVQueryComplete(status,
                                                      request.url,
                                                      headers,
                                                      responseText,
                                                      request.callbackData);
                }
                request.client = null;
                request.url = null;
                request.callbackData = null;
                request.onreadystatechange = null;
                request = null;
            }
        };

        request.send(parameters);
        // dump("xmlrequest sent: '" + method + "\n");
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
}

CalDAVAclCalendarEntry.prototype = {
    uri: null,
    entries: null,

    userIsOwner: function userIsOwner() {
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

        //         dump("user is owner: " + result + "\n");

        return result;
    },
    userCanAddItems: function userCanAddItems() {
        // dump("has access control: " + this.hasAccessControl + "\n");
        return (!this.hasAccessControl
                || (this.userPrivileges.indexOf("{DAV:}bind")
                    > -1));
    },
    userCanDeleteItems: function userCanAddItems() {
        // dump("has access control: " + this.hasAccessControl + "\n");
        // if (this.userPrivileges)
        // dump("indexof unbind: "
        // + this.userPrivileges.indexOf("{DAV:}unbind") + "\n");
        return (!this.hasAccessControl
                || (this.userPrivileges.indexOf("{DAV:}unbind")
                    > -1));
    },

    getUserAddresses: function getUserAddresses(outCount, outAddresses) {
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

function CalDAVAclItemEntry(calendarEntry, url) {
    this.parentCalendarEntry = calendarEntry;
    this.url = url;
}

CalDAVAclItemEntry.prototype = {
    parentCalendarEntry: null,
    url: null,
    userPrivileges: null,

    userIsOwner: function userIsOwner() {
        return this.parentCalendarEntry.userIsOwner();
    },
    userCanModify: function userCanModify() {
        // dump("this.url: " + this.url + "\n");
        // dump("this.userPrivileges: " + this.userPrivileges + "\n");
        // dump("this.parentCalendarEntry.userPrivileges: "
        // + this.parentCalendarEntry.userPrivileges + "\n");

        let result;
        if (this.parentCalendarEntry.hasAccessControl) {
            let index = (this.url
                         ? this.userPrivileges.indexOf("{DAV:}write")
                         : this.parentCalendarEntry.userPrivileges.indexOf("{DAV:}bind"));
            result = (index > -1);
        }
        else
            result = true;

        return result;
    },
    userCanRespond: function userCanRespond() {
        return (!this.parentCalendarEntry.hasAccessControl
                || (this.userPrivileges
                        .indexOf("{urn:inverse:params:xml:ns:inverse-dav}respond-to-component")
                    > -1));
    },
    userCanViewAll: function userCanViewAll() {
        return (!this.parentCalendarEntry.hasAccessControl
                ||  (this.userPrivileges
                         .indexOf("{urn:inverse:params:xml:ns:inverse-dav}view-whole-component")
                     > -1));
    },
    userCanViewDAndT: function userCanViewDAndT() {
        return (!this.parentCalendarEntry.hasAccessControl
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
