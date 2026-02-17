# Google Calendar API Reference

Pages: 103


---
# https://developers.google.com/workspace/calendar/api/guides/overview

Send feedback

# Google Calendar API overview Stay organized with collections Save and categorize content based on your preferences.

The Google Calendar API is a RESTful API that can be accessed through explicit HTTP
calls or using the Google Client Libraries. The API exposes most of the features
available in the Google Calendar Web interface.

Following is a list of common terms used in the Google Calendar API:

*[Event](/workspace/calendar/v3/reference/events)*
:   An event on a calendar containing information such as the title, start and end
    times, and attendees. Events can be either single events or [recurring
    events](/workspace/calendar/concepts/events-calendars#recurring_events). An event is
    represented by an
    [Event resource](/workspace/calendar/v3/reference/events#resource-representations).

*[Calendar](/workspace/calendar/v3/reference/calendars)*
:   A collection of events. Each calendar has associated metadata, such as
    calendar description or default calendar time zone. The metadata for a single
    calendar is represented by a
    [Calendar resource](/workspace/calendar/v3/reference/calendars).

*[Calendar List](/workspace/calendar/v3/reference/calendarList)*
:   A list of all calendars on a user's calendar list in the Calendar UI. The
    metadata for a single calendar that appears on the calendar list is represented
    by a
    [CalendarListEntry resource](/workspace/calendar/v3/reference/calendarList).
    This metadata includes user-specific properties of the calendar, such
    as its color or notifications for new events.

*[Setting](/workspace/calendar/v3/reference/settings)*
:   A user preference from the Calendar UI, such as the user's
    time zone. A single user preference is represented by a
    [Setting Resource](/workspace/calendar/v3/reference/settings).

*[ACL](/workspace/calendar/v3/reference/acl)*
:   An access control rule granting a user (or a group of users) a specified level
    of access to a calendar. A single access control rule is represented by an [ACL
    resource](/workspace/calendar/v3/reference/acl).

## Related topics

* To learn about developing with Google Workspace APIs, including handling
  authentication and authorization, refer
  to
  [Get started as a Google Workspace developer](/workspace/guides/getstarted-overview).
* To learn how to configure and run a simple Google Calendar API app, read the
  [Quickstarts overview](/workspace/calendar/quickstarts-overview).

|  |  |
| --- | --- |
|  | Want to see the Google Calendar API in action?  The Google Workspace Developers channel offers videos about tips, tricks, and the latest features.  [Subscribe now](https://www.youtube.com/channel/UCUcg6az6etU_gRtZVAhBXaw) |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/v3/reference/acl

Send feedback

# Acl Stay organized with collections Save and categorize content based on your preferences.

For a list of [methods](#methods) for this resource, see the end of this page.

## Resource representations

```
{
  "kind": "calendar#aclRule",
  "etag": etag,
  "id": string,
  "scope": {
    "type": string,
    "value": string
  },
  "role": string
}
```

| Property name | Value | Description | Notes |
| --- | --- | --- | --- |
| `etag` | `etag` | ETag of the resource. |  |
| `id` | `string` | Identifier of the Access Control List (ACL) rule. See [Sharing calendars](https://developers.google.com/workspace/calendar/concepts/sharing#sharing_calendars). |  |
| `kind` | `string` | Type of the resource ("`calendar#aclRule`"). |  |
| `role` | `string` | The role assigned to the scope. Possible values are:  * "`none`" - Provides no access. * "`freeBusyReader`" - Provides read access to free/busy information. * "`reader`" - Provides read access to the calendar. Private events will appear to users with reader access, but event details will be hidden. * "`writer`" - Provides read and write access to the calendar. Private events will appear to users with writer access, and event details will be visible. Provides read access to the calendar's ACLs. * "`owner`" - Provides manager access to the calendar. This role has all of the permissions of the writer role with the additional ability to modify access levels of other users.  Important: the `owner` role is different from the calendar's data owner. A calendar has a single data owner, but can have multiple users with `owner` role. | writable |
| `scope` | `object` | The extent to which [calendar access](https://developers.google.com/workspace/calendar/concepts/sharing#sharing_calendars) is granted by this ACL rule. |  |
| `scope.type` | `string` | The type of the scope. Possible values are:  * "`default`" - The public scope. This is the default value. * "`user`" - Limits the scope to a single user. * "`group`" - Limits the scope to a group. * "`domain`" - Limits the scope to a domain.  Note: The permissions granted to the "`default`", or public, scope apply to any user, authenticated or not. |  |
| `scope.value` | `string` | The email address of a user or group, or the name of a domain, depending on the scope type. Omitted for type "`default`". | writable |

## Methods

[delete](/workspace/calendar/api/v3/reference/acl/delete)
:   Deletes an access control rule.

[get](/workspace/calendar/api/v3/reference/acl/get)
:   Returns an access control rule.

[insert](/workspace/calendar/api/v3/reference/acl/insert)
:   Creates an access control rule.

[list](/workspace/calendar/api/v3/reference/acl/list)
:   Returns the rules in the access control list for the calendar.

[patch](/workspace/calendar/api/v3/reference/acl/patch)
:   Updates an access control rule. This method supports patch semantics. Note that each patch request consumes three quota units; prefer using a `get` followed by an `update`. The field values you specify replace the existing values. Fields that you don't specify in the request remain unchanged. Array fields, if specified, overwrite the existing arrays; this discards any previous array elements.

[update](/workspace/calendar/api/v3/reference/acl/update)
:   Updates an access control rule.

[watch](/workspace/calendar/api/v3/reference/acl/watch)
:   Watch for changes to ACL resources.




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/api/v3/reference/acl/list

Send feedback

# Acl: list Stay organized with collections Save and categorize content based on your preferences.

**Note:**
Requires [authorization](#auth).

Returns the rules in the access control list for the calendar.
[Try it now](#try-it).

## Request

### HTTP request

```
GET https://www.googleapis.com/calendar/v3/calendars/calendarId/acl
```

### Parameters

| Parameter name | Value | Description |
| --- | --- | --- |
| **Path parameters** | | |
| `calendarId` | `string` | Calendar identifier. To retrieve calendar IDs call the [calendarList.list](/workspace/calendar/api/v3/reference/calendarList/list) method. If you want to access the primary calendar of the currently logged in user, use the "`primary`" keyword. |
| **Optional query parameters** | | |
| `maxResults` | `integer` | Maximum number of entries returned on one result page. By default the value is 100 entries. The page size can never be larger than 250 entries. Optional. |
| `pageToken` | `string` | Token specifying which result page to return. Optional. |
| `showDeleted` | `boolean` | Whether to include deleted ACLs in the result. Deleted ACLs are represented by `role` equal to "`none`". Deleted ACLs will always be included if `syncToken` is provided. Optional. The default is False. |
| `syncToken` | `string` | Token obtained from the `nextSyncToken` field returned on the last page of results from the previous list request. It makes the result of this list request contain only entries that have changed since then. All entries deleted since the previous list request will always be in the result set and it is not allowed to set `showDeleted` to False.  If the `syncToken` expires, the server will respond with a 410 GONE response code and the client should clear its storage and perform a full synchronization without any `syncToken`.  [Learn more](/workspace/calendar/api/guides/sync) about incremental synchronization.   Optional. The default is to return all entries. |

### Authorization

This request requires authorization with at least one of the following scopes:

| Scope |
| --- |
| `https://www.googleapis.com/auth/calendar` |
| `https://www.googleapis.com/auth/calendar.acls` |
| `https://www.googleapis.com/auth/calendar.acls.readonly` |

For more information, see the [authentication and authorization](/workspace/guides/configure-oauth-consent) page.

### Request body

Do not supply a request body with this method.

## Response

If successful, this method returns a response body with the following structure:

```
{
  "kind": "calendar#acl",
  "etag": etag,
  "nextPageToken": string,
  "nextSyncToken": string,
  "items": [
    acl Resource
  ]
}
```

| Property name | Value | Description | Notes |
| --- | --- | --- | --- |
| `kind` | `string` | Type of the collection ("`calendar#acl`"). |  |
| `etag` | `etag` | ETag of the collection. |  |
| `nextPageToken` | `string` | Token used to access the next page of this result. Omitted if no further results are available, in which case `nextSyncToken` is provided. |  |
| `items[]` | `list` | List of rules on the access control list. |  |
| `nextSyncToken` | `string` | Token used at a later point in time to retrieve only the entries that have changed since this result was returned. Omitted if further results are available, in which case `nextPageToken` is provided. |  |

Open API Explorer




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/api/v3/reference/acl/patch

Send feedback

# Acl: patch Stay organized with collections Save and categorize content based on your preferences.

**Note:**
Requires [authorization](#auth).

Updates an access control rule. This method supports patch semantics. Note that each patch request consumes three quota units; prefer using a `get` followed by an `update`. The field values you specify replace the existing values. Fields that you don't specify in the request remain unchanged. Array fields, if specified, overwrite the existing arrays; this discards any previous array elements.
[Try it now](#try-it).

## Request

### HTTP request

```
PATCH https://www.googleapis.com/calendar/v3/calendars/calendarId/acl/ruleId
```

### Parameters

| Parameter name | Value | Description |
| --- | --- | --- |
| **Path parameters** | | |
| `calendarId` | `string` | Calendar identifier. To retrieve calendar IDs call the [calendarList.list](/workspace/calendar/api/v3/reference/calendarList/list) method. If you want to access the primary calendar of the currently logged in user, use the "`primary`" keyword. |
| `ruleId` | `string` | ACL rule identifier. |
| **Optional query parameters** | | |
| `sendNotifications` | `boolean` | Whether to send notifications about the calendar sharing change. Note that there are no notifications on access removal. Optional. The default is True. |

### Authorization

This request requires authorization with at least one of the following scopes:

| Scope |
| --- |
| `https://www.googleapis.com/auth/calendar` |
| `https://www.googleapis.com/auth/calendar.acls` |

For more information, see the [authentication and authorization](/workspace/guides/configure-oauth-consent) page.

### Request body

In the request body, supply the relevant portions of an [Acl resource](/workspace/calendar/api/v3/reference/acl#resource), according to the rules of patch semantics.

## Response

If successful, this method returns an [Acl resource](/workspace/calendar/api/v3/reference/acl#resource) in the response body.




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/v3/reference/events

Send feedback

# Events Stay organized with collections Save and categorize content based on your preferences.

The Calendar API provides different flavors of event resources, more information can be found in [About events](/workspace/calendar/api/concepts#events_resource).

For a list of [methods](#methods) for this resource, see the end of this page.

## Resource representations

```
{
  "kind": "calendar#event",
  "etag": etag,
  "id": string,
  "status": string,
  "htmlLink": string,
  "created": datetime,
  "updated": datetime,
  "summary": string,
  "description": string,
  "location": string,
  "colorId": string,
  "creator": {
    "id": string,
    "email": string,
    "displayName": string,
    "self": boolean
  },
  "organizer": {
    "id": string,
    "email": string,
    "displayName": string,
    "self": boolean
  },
  "start": {
    "date": date,
    "dateTime": datetime,
    "timeZone": string
  },
  "end": {
    "date": date,
    "dateTime": datetime,
    "timeZone": string
  },
  "endTimeUnspecified": boolean,
  "recurrence": [
    string
  ],
  "recurringEventId": string,
  "originalStartTime": {
    "date": date,
    "dateTime": datetime,
    "timeZone": string
  },
  "transparency": string,
  "visibility": string,
  "iCalUID": string,
  "sequence": integer,
  "attendees": [
    {
      "id": string,
      "email": string,
      "displayName": string,
      "organizer": boolean,
      "self": boolean,
      "resource": boolean,
      "optional": boolean,
      "responseStatus": string,
      "comment": string,
      "additionalGuests": integer
    }
  ],
  "attendeesOmitted": boolean,
  "extendedProperties": {
    "private": {
      (key): string
    },
    "shared": {
      (key): string
    }
  },
  "hangoutLink": string,
  "conferenceData": {
    "createRequest": {
      "requestId": string,
      "conferenceSolutionKey": {
        "type": string
      },
      "status": {
        "statusCode": string
      }
    },
    "entryPoints": [
      {
        "entryPointType": string,
        "uri": string,
        "label": string,
        "pin": string,
        "accessCode": string,
        "meetingCode": string,
        "passcode": string,
        "password": string
      }
    ],
    "conferenceSolution": {
      "key": {
        "type": string
      },
      "name": string,
      "iconUri": string
    },
    "conferenceId": string,
    "signature": string,
    "notes": string,
  },
  "gadget": {
    "type": string,
    "title": string,
    "link": string,
    "iconLink": string,
    "width": integer,
    "height": integer,
    "display": string,
    "preferences": {
      (key): string
    }
  },
  "anyoneCanAddSelf": boolean,
  "guestsCanInviteOthers": boolean,
  "guestsCanModify": boolean,
  "guestsCanSeeOtherGuests": boolean,
  "privateCopy": boolean,
  "locked": boolean,
  "reminders": {
    "useDefault": boolean,
    "overrides": [
      {
        "method": string,
        "minutes": integer
      }
    ]
  },
  "source": {
    "url": string,
    "title": string
  },
  "workingLocationProperties": {
    "type": string,
    "homeOffice": (value),
    "customLocation": {
      "label": string
    },
    "officeLocation": {
      "buildingId": string,
      "floorId": string,
      "floorSectionId": string,
      "deskId": string,
      "label": string
    }
  },
  "outOfOfficeProperties": {
    "autoDeclineMode": string,
    "declineMessage": string
  },
  "focusTimeProperties": {
    "autoDeclineMode": string,
    "declineMessage": string,
    "chatStatus": string
  },
  "attachments": [
    {
      "fileUrl": string,
      "title": string,
      "mimeType": string,
      "iconLink": string,
      "fileId": string
    }
  ],
  "birthdayProperties": {
    "contact": string,
    "type": string,
    "customTypeName": string
  },
  "eventType": string
}
```

| Property name | Value | Description | Notes |
| --- | --- | --- | --- |
| `anyoneCanAddSelf` | `boolean` | Whether anyone can invite themselves to the event (deprecated). Optional. The default is False. | writable |
| `attachments[]` | `list` | File attachments for the event. In order to modify attachments the `supportsAttachments` request parameter should be set to `true`.  There can be at most 25 attachments per event, |  |
| `attachments[].fileId` | `string` | ID of the attached file. Read-only. For Google Drive files, this is the ID of the corresponding [`Files`](/drive/v3/reference/files) resource entry in the Drive API. |  |
| `attachments[].fileUrl` | `string` | URL link to the attachment. For adding Google Drive file attachments use the same format as in `alternateLink` property of the `Files` resource in the Drive API.  Required when adding an attachment. | writable |
| `attachments[].iconLink` | `string` | URL link to the attachment's icon. This field can only be modified for custom third-party attachments. |  |
| `attachments[].mimeType` | `string` | Internet media type (MIME type) of the attachment. |  |
| `attachments[].title` | `string` | Attachment title. |  |
| `attendeesOmitted` | `boolean` | Whether attendees may have been omitted from the event's representation. When retrieving an event, this may be due to a restriction specified by the `maxAttendee` query parameter. When updating an event, this can be used to only update the participant's response. Optional. The default is False. | writable |
| `attendees[]` | `list` | The attendees of the event. See the [Events with attendees](/calendar/concepts/sharing) guide for more information on scheduling events with other calendar users. Service accounts need to use [domain-wide delegation of authority](/calendar/auth#perform-g-suite-domain-wide-delegation-of-authority) to populate the attendee list. | writable |
| `attendees[].additionalGuests` | `integer` | Number of additional guests. Optional. The default is 0. | writable |
| `attendees[].comment` | `string` | The attendee's response comment. Optional. | writable |
| `attendees[].displayName` | `string` | The attendee's name, if available. Optional. | writable |
| `attendees[].email` | `string` | The attendee's email address, if available. This field must be present when adding an attendee. It must be a valid email address as per [RFC5322](https://tools.ietf.org/html/rfc5322#section-3.4). Required when adding an attendee. | writable |
| `attendees[].id` | `string` | The attendee's Profile ID, if available. |  |
| `attendees[].optional` | `boolean` | Whether this is an optional attendee. Optional. The default is False. | writable |
| `attendees[].organizer` | `boolean` | Whether the attendee is the organizer of the event. Read-only. The default is False. |  |
| `attendees[].resource` | `boolean` | Whether the attendee is a resource. Can only be set when the attendee is added to the event for the first time. Subsequent modifications are ignored. Optional. The default is False. | writable |
| `attendees[].responseStatus` | `string` | The attendee's response status. Possible values are:  * "`needsAction`" - The attendee has not responded to the invitation (recommended for new events). * "`declined`" - The attendee has declined the invitation. * "`tentative`" - The attendee has tentatively accepted the invitation. * "`accepted`" - The attendee has accepted the invitation.  **Warning:** If you add an event using the values `declined`, `tentative`, or `accepted`, attendees with the "Add invitations to my calendar" setting set to "When I respond to invitation in email" or "Only if the sender is known" might have their response reset to `needsAction` and won't see an event in their calendar unless they change their response in the event invitation email. Furthermore, if more than 200 guests are invited to the event, response status is not propagated to the guests. | writable |
| `attendees[].self` | `boolean` | Whether this entry represents the calendar on which this copy of the event appears. Read-only. The default is False. |  |
| `birthdayProperties` | `nested object` | Birthday or special event data. Used if `eventType` is `"birthday"`. Immutable. | writable |
| `birthdayProperties.contact` | `string` | Resource name of the contact this birthday event is linked to. This can be used to fetch contact details from [People API](/people). Format: `"people/c12345"`. Read-only. |  |
| `birthdayProperties.customTypeName` | `string` | Custom type label specified for this event. This is populated if `birthdayProperties.type` is set to `"custom"`. Read-only. |  |
| `birthdayProperties.type` | `string` | Type of birthday or special event. Possible values are:  * `"anniversary"` - An anniversary other than birthday. Always has a `contact`. * `"birthday"` - A birthday event. This is the default value. * `"custom"` - A special date whose label is further specified in the `customTypeName` field. Always has a `contact`. * `"other"` - A special date which does not fall into the other categories, and does not have a custom label. Always has a `contact`. * `"self"` - Calendar owner's own birthday. Cannot have a `contact`.  The Calendar API only supports creating events with the type `"birthday"`. The type cannot be changed after the event is created. | writable |
| `colorId` | `string` | The color of the event. This is an ID referring to an entry in the `event` section of the colors definition (see the  [colors endpoint](/calendar/v3/reference/colors)). Optional. | writable |
| `conferenceData` | `nested object` | The conference-related information, such as details of a Google Meet conference. To create new conference details use the `createRequest` field. To persist your changes, remember to set the `conferenceDataVersion` request parameter to `1` for all event modification requests. **Warning:** Reusing Google Meet conference data across different events can cause access issues and expose meeting details to unintended users. To help ensure meeting privacy, always generate a unique conference for each event by using the `createRequest` field. | writable |
| `conferenceData.conferenceId` | `string` | The ID of the conference. Can be used by developers to keep track of conferences, should not be displayed to users.  The ID value is formed differently for each conference solution type:   * `eventHangout`: ID is not set. (This conference type is deprecated.) * `eventNamedHangout`: ID is the name of the Hangout. (This conference type is deprecated.) * `hangoutsMeet`: ID is the 10-letter meeting code, for example `aaa-bbbb-ccc`. * `addOn`: ID is defined by the third-party provider.  Optional. |  |
| `conferenceData.conferenceSolution` | `nested object` | The conference solution, such as Google Meet. Unset for a conference with a failed create request.  Either `conferenceSolution` and at least one `entryPoint`, or `createRequest` is required. |  |
| `conferenceData.conferenceSolution.iconUri` | `string` | The user-visible icon for this solution. |  |
| `conferenceData.conferenceSolution.key` | `nested object` | The key which can uniquely identify the conference solution for this event. |  |
| `conferenceData.conferenceSolution.key.type` | `string` | The conference solution type. If a client encounters an unfamiliar or empty type, it should still be able to display the entry points. However, it should disallow modifications.  The possible values are:   * `"eventHangout"` for Hangouts for consumers (deprecated; existing events may show this conference solution type but new conferences cannot be created) * `"eventNamedHangout"` for classic Hangouts for Google Workspace users (deprecated; existing events may show this conference solution type but new conferences cannot be created) * `"hangoutsMeet"` for Google Meet (http://meet.google.com) * `"addOn"` for 3P conference providers |  |
| `conferenceData.conferenceSolution.name` | `string` | The user-visible name of this solution. Not localized. |  |
| `conferenceData.createRequest` | `nested object` | A request to generate a new conference and attach it to the event. The data is generated asynchronously. To see whether the data is present check the `status` field. Either `conferenceSolution` and at least one `entryPoint`, or `createRequest` is required. |  |
| `conferenceData.createRequest.conferenceSolutionKey` | `nested object` | The conference solution, such as Hangouts or Google Meet. |  |
| `conferenceData.createRequest.conferenceSolutionKey.type` | `string` | The conference solution type. If a client encounters an unfamiliar or empty type, it should still be able to display the entry points. However, it should disallow modifications.  The possible values are:   * `"eventHangout"` for Hangouts for consumers (deprecated; existing events may show this conference solution type but new conferences cannot be created) * `"eventNamedHangout"` for classic Hangouts for Google Workspace users (deprecated; existing events may show this conference solution type but new conferences cannot be created) * `"hangoutsMeet"` for Google Meet (http://meet.google.com) * `"addOn"` for 3P conference providers |  |
| `conferenceData.createRequest.requestId` | `string` | The client-generated unique ID for this request. Clients should regenerate this ID for every new request. If an ID provided is the same as for the previous request, the request is ignored. |  |
| `conferenceData.createRequest.status` | `nested object` | The status of the conference create request. |  |
| `conferenceData.createRequest.status.statusCode` | `string` | The current status of the conference create request. Read-only. The possible values are:   * `"pending"`: the conference create request is still being processed. * `"success"`: the conference create request succeeded, the entry points are populated. * `"failure"`: the conference create request failed, there are no entry points. |  |
| `conferenceData.entryPoints[]` | `list` | Information about individual conference entry points, such as URLs or phone numbers. All of them must belong to the same conference.  Either `conferenceSolution` and at least one `entryPoint`, or `createRequest` is required. |  |
| `conferenceData.entryPoints[].accessCode` | `string` | The access code to access the conference. The maximum length is 128 characters. When creating new conference data, populate only the subset of {`meetingCode`, `accessCode`, `passcode`, `password`, `pin`} fields that match the terminology that the conference provider uses. Only the populated fields should be displayed.  Optional. |  |
| `conferenceData.entryPoints[].entryPointType` | `string` | The type of the conference entry point. Possible values are:   * `"video"` - joining a conference over HTTP. A conference can have zero or one `video` entry point. * `"phone"` - joining a conference by dialing a phone number. A conference can have zero or more `phone` entry points. * `"sip"` - joining a conference over SIP. A conference can have zero or one `sip` entry point. * `"more"` - further conference joining instructions, for example additional phone numbers. A conference can have zero or one `more` entry point. A conference with only a `more` entry point is not a valid conference. |  |
| `conferenceData.entryPoints[].label` | `string` | The label for the URI. Visible to end users. Not localized. The maximum length is 512 characters. Examples:   * for `video`: meet.google.com/aaa-bbbb-ccc * for `phone`: +1 123 268 2601 * for `sip`: 12345678@altostrat.com * for `more`: should not be filled   Optional. |  |
| `conferenceData.entryPoints[].meetingCode` | `string` | The meeting code to access the conference. The maximum length is 128 characters. When creating new conference data, populate only the subset of {`meetingCode`, `accessCode`, `passcode`, `password`, `pin`} fields that match the terminology that the conference provider uses. Only the populated fields should be displayed.  Optional. |  |
| `conferenceData.entryPoints[].passcode` | `string` | The passcode to access the conference. The maximum length is 128 characters. When creating new conference data, populate only the subset of {`meetingCode`, `accessCode`, `passcode`, `password`, `pin`} fields that match the terminology that the conference provider uses. Only the populated fields should be displayed. |  |
| `conferenceData.entryPoints[].password` | `string` | The password to access the conference. The maximum length is 128 characters. When creating new conference data, populate only the subset of {`meetingCode`, `accessCode`, `passcode`, `password`, `pin`} fields that match the terminology that the conference provider uses. Only the populated fields should be displayed.  Optional. |  |
| `conferenceData.entryPoints[].pin` | `string` | The PIN to access the conference. The maximum length is 128 characters. When creating new conference data, populate only the subset of {`meetingCode`, `accessCode`, `passcode`, `password`, `pin`} fields that match the terminology that the conference provider uses. Only the populated fields should be displayed.  Optional. |  |
| `conferenceData.entryPoints[].uri` | `string` | The URI of the entry point. The maximum length is 1300 characters. Format:   * for `video`, `http:` or `https:` schema is required. * for `phone`, `tel:` schema is required. The URI should include the entire dial sequence (e.g., tel:+12345678900,,,123456789;1234). * for `sip`, `sip:` schema is required, e.g., sip:12345678@myprovider.com. * for `more`, `http:` or `https:` schema is required. |  |
| `conferenceData.notes` | `string` | Additional notes (such as instructions from the domain administrator, legal notices) to display to the user. Can contain HTML. The maximum length is 2048 characters. Optional. |  |
| `conferenceData.signature` | `string` | The signature of the conference data. Generated on server side.  Unset for a conference with a failed create request.  Optional for a conference with a pending create request. |  |
| `created` | `datetime` | Creation time of the event (as a [RFC3339](https://tools.ietf.org/html/rfc3339) timestamp). Read-only. |  |
| `creator` | `object` | The creator of the event. Read-only. |  |
| `creator.displayName` | `string` | The creator's name, if available. |  |
| `creator.email` | `string` | The creator's email address, if available. |  |
| `creator.id` | `string` | The creator's Profile ID, if available. |  |
| `creator.self` | `boolean` | Whether the creator corresponds to the calendar on which this copy of the event appears. Read-only. The default is False. |  |
| `description` | `string` | Description of the event. Can contain HTML. Optional. | writable |
| `end` | `nested object` | The (exclusive) end time of the event. For a recurring event, this is the end time of the first instance. |  |
| `end.date` | `date` | The date, in the format "yyyy-mm-dd", if this is an all-day event. | writable |
| `end.dateTime` | `datetime` | The time, as a combined date-time value (formatted according to [RFC3339](https://tools.ietf.org/html/rfc3339)). A time zone offset is required unless a time zone is explicitly specified in `timeZone`. | writable |
| `end.timeZone` | `string` | The time zone in which the time is specified. (Formatted as an IANA Time Zone Database name, e.g. "Europe/Zurich".) For recurring events this field is required and specifies the time zone in which the recurrence is expanded. For single events this field is optional and indicates a custom time zone for the event start/end. | writable |
| `endTimeUnspecified` | `boolean` | Whether the end time is actually unspecified. An end time is still provided for compatibility reasons, even if this attribute is set to True. The default is False. |  |
| `etag` | `etag` | ETag of the resource. |  |
| `eventType` | `string` | Specific type of the event. This cannot be modified after the event is created. Possible values are:  * "`birthday`" - A special all-day event with an annual recurrence. * "`default`" - A regular event or not further specified. * "`focusTime`" - A focus-time event. * "`fromGmail`" - An event from Gmail. This type of event cannot be created. * "`outOfOffice`" - An out-of-office event. * "`workingLocation`" - A working location event. | writable |
| `extendedProperties` | `object` | Extended properties of the event. |  |
| `extendedProperties.private` | `object` | Properties that are private to the copy of the event that appears on this calendar. | writable |
| `extendedProperties.private.(key)` | `string` | The name of the private property and the corresponding value. |  |
| `extendedProperties.shared` | `object` | Properties that are shared between copies of the event on other attendees' calendars. | writable |
| `extendedProperties.shared.(key)` | `string` | The name of the shared property and the corresponding value. |  |
| `focusTimeProperties` | `nested object` | Focus Time event data. Used if `eventType` is `focusTime`. | writable |
| `focusTimeProperties.autoDeclineMode` | `string` | Whether to decline meeting invitations which overlap Focus Time events. Valid values are `declineNone`, meaning that no meeting invitations are declined; `declineAllConflictingInvitations`, meaning that all conflicting meeting invitations that conflict with the event are declined; and `declineOnlyNewConflictingInvitations`, meaning that only new conflicting meeting invitations which arrive while the Focus Time event is present are to be declined. |  |
| `focusTimeProperties.chatStatus` | `string` | The status to mark the user in Chat and related products. This can be `available` or `doNotDisturb`. |  |
| `focusTimeProperties.declineMessage` | `string` | Response message to set if an existing event or new invitation is automatically declined by Calendar. |  |
| `gadget` | `object` | A gadget that extends this event. Gadgets are deprecated; this structure is instead only used for returning birthday calendar metadata. |  |
| `gadget.display` | `string` | The gadget's display mode. Deprecated. Possible values are:  * "`icon`" - The gadget displays next to the event's title in the calendar view. * "`chip`" - The gadget displays when the event is clicked. | writable |
| `gadget.height` | `integer` | The gadget's height in pixels. The height must be an integer greater than 0. Optional. Deprecated. | writable |
| `gadget.iconLink` | `string` | The gadget's icon URL. The URL scheme must be HTTPS. Deprecated. | writable |
| `gadget.link` | `string` | The gadget's URL. The URL scheme must be HTTPS. Deprecated. | writable |
| `gadget.preferences` | `object` | Preferences. | writable |
| `gadget.preferences.(key)` | `string` | The preference name and corresponding value. |  |
| `gadget.title` | `string` | The gadget's title. Deprecated. | writable |
| `gadget.type` | `string` | The gadget's type. Deprecated. | writable |
| `gadget.width` | `integer` | The gadget's width in pixels. The width must be an integer greater than 0. Optional. Deprecated. | writable |
| `guestsCanInviteOthers` | `boolean` | Whether attendees other than the organizer can invite others to the event. Optional. The default is True. | writable |
| `guestsCanModify` | `boolean` | Whether attendees other than the organizer can modify the event. Optional. The default is False. | writable |
| `guestsCanSeeOtherGuests` | `boolean` | Whether attendees other than the organizer can see who the event's attendees are. Optional. The default is True. | writable |
| `hangoutLink` | `string` | An absolute link to the Google Hangout associated with this event. Read-only. |  |
| `htmlLink` | `string` | An absolute link to this event in the Google Calendar Web UI. Read-only. |  |
| `iCalUID` | `string` | Event unique identifier as defined in [RFC5545](https://tools.ietf.org/html/rfc5545#section-3.8.4.7). It is used to uniquely identify events accross calendaring systems and must be supplied when importing events via the [import](/calendar/v3/reference/events/import) method. Note that the `iCalUID` and the `id` are not identical and only one of them should be supplied at event creation time. One difference in their semantics is that in recurring events, all occurrences of one event have different `id`s while they all share the same `iCalUID`s. To retrieve an event using its `iCalUID`, call the [events.list method using the `iCalUID` parameter](/calendar/v3/reference/events/list#iCalUID). To retrieve an event using its `id`, call the [events.get](/calendar/v3/reference/events/get) method. |  |
| `id` | `string` | Opaque identifier of the event. When creating new single or recurring events, you can specify their IDs. Provided IDs must follow these rules:  * characters allowed in the ID are those used in base32hex encoding, i.e. lowercase letters a-v and digits 0-9, see section 3.1.2 in [RFC2938](http://tools.ietf.org/html/rfc2938#section-3.1.2) * the length of the ID must be between 5 and 1024 characters * the ID must be unique per calendar  Due to the globally distributed nature of the system, we cannot guarantee that ID collisions will be detected at event creation time. To minimize the risk of collisions we recommend using an established UUID algorithm such as one described in [RFC4122](https://tools.ietf.org/html/rfc4122). If you do not specify an ID, it will be automatically generated by the server.  Note that the `icalUID` and the `id` are not identical and only one of them should be supplied at event creation time. One difference in their semantics is that in recurring events, all occurrences of one event have different `id`s while they all share the same `icalUID`s. | writable |
| `kind` | `string` | Type of the resource ("`calendar#event`"). |  |
| `location` | `string` | Geographic location of the event as free-form text. Optional. | writable |
| `locked` | `boolean` | Whether this is a locked event copy where no changes can be made to the main event fields "summary", "description", "location", "start", "end" or "recurrence". The default is False. Read-Only. |  |
| `organizer` | `object` | The organizer of the event. If the organizer is also an attendee, this is indicated with a separate entry in `attendees` with the `organizer` field set to True. To change the organizer, use the [move](/calendar/v3/reference/events/move) operation. Read-only, except when importing an event. | writable |
| `organizer.displayName` | `string` | The organizer's name, if available. | writable |
| `organizer.email` | `string` | The organizer's email address, if available. It must be a valid email address as per [RFC5322](https://tools.ietf.org/html/rfc5322#section-3.4). | writable |
| `organizer.id` | `string` | The organizer's Profile ID, if available. |  |
| `organizer.self` | `boolean` | Whether the organizer corresponds to the calendar on which this copy of the event appears. Read-only. The default is False. |  |
| `originalStartTime` | `nested object` | For an instance of a recurring event, this is the time at which this event would start according to the recurrence data in the recurring event identified by recurringEventId. It uniquely identifies the instance within the recurring event series even if the instance was moved to a different time. Immutable. |  |
| `originalStartTime.date` | `date` | The date, in the format "yyyy-mm-dd", if this is an all-day event. | writable |
| `originalStartTime.dateTime` | `datetime` | The time, as a combined date-time value (formatted according to [RFC3339](https://tools.ietf.org/html/rfc3339)). A time zone offset is required unless a time zone is explicitly specified in `timeZone`. | writable |
| `originalStartTime.timeZone` | `string` | The time zone in which the time is specified. (Formatted as an IANA Time Zone Database name, e.g. "Europe/Zurich".) For recurring events this field is required and specifies the time zone in which the recurrence is expanded. For single events this field is optional and indicates a custom time zone for the event start/end. | writable |
| `outOfOfficeProperties` | `nested object` | Out of office event data. Used if `eventType` is `outOfOffice`. | writable |
| `outOfOfficeProperties.autoDeclineMode` | `string` | Whether to decline meeting invitations which overlap Out of office events. Valid values are `declineNone`, meaning that no meeting invitations are declined; `declineAllConflictingInvitations`, meaning that all conflicting meeting invitations that conflict with the event are declined; and `declineOnlyNewConflictingInvitations`, meaning that only new conflicting meeting invitations which arrive while the Out of office event is present are to be declined. |  |
| `outOfOfficeProperties.declineMessage` | `string` | Response message to set if an existing event or new invitation is automatically declined by Calendar. |  |
| `privateCopy` | `boolean` | If set to True, [Event propagation](/calendar/concepts/sharing#event_propagation) is disabled. Note that it is not the same thing as [Private event properties](/calendar/concepts/sharing#private_event_properties). Optional. Immutable. The default is False. |  |
| `recurrence[]` | `list` | List of RRULE, EXRULE, RDATE and EXDATE lines for a recurring event, as specified in [RFC5545](http://tools.ietf.org/html/rfc5545#section-3.8.5). Note that DTSTART and DTEND lines are not allowed in this field; event start and end times are specified in the `start` and `end` fields. This field is omitted for single events or instances of recurring events. | writable |
| `recurringEventId` | `string` | For an instance of a recurring event, this is the `id` of the recurring event to which this instance belongs. Immutable. |  |
| `reminders` | `object` | Information about the event's reminders for the authenticated user. Note that changing reminders does not also change the `updated` property of the enclosing event. |  |
| `reminders.overrides[]` | `list` | If the event doesn't use the default reminders, this lists the reminders specific to the event, or, if not set, indicates that no reminders are set for this event. The maximum number of override reminders is 5. | writable |
| `reminders.overrides[].method` | `string` | The method used by this reminder. Possible values are:  * "`email`" - Reminders are sent via email. * "`popup`" - Reminders are sent via a UI popup.   Required when adding a reminder. | writable |
| `reminders.overrides[].minutes` | `integer` | Number of minutes before the start of the event when the reminder should trigger. Valid values are between 0 and 40320 (4 weeks in minutes). Required when adding a reminder. | writable |
| `reminders.useDefault` | `boolean` | Whether the default reminders of the calendar apply to the event. | writable |
| `sequence` | `integer` | Sequence number as per iCalendar. | writable |
| `source` | `object` | Source from which the event was created. For example, a web page, an email message or any document identifiable by an URL with HTTP or HTTPS scheme. Can only be seen or modified by the creator of the event. |  |
| `source.title` | `string` | Title of the source; for example a title of a web page or an email subject. | writable |
| `source.url` | `string` | URL of the source pointing to a resource. The URL scheme must be HTTP or HTTPS. | writable |
| `start` | `nested object` | The (inclusive) start time of the event. For a recurring event, this is the start time of the first instance. |  |
| `start.date` | `date` | The date, in the format "yyyy-mm-dd", if this is an all-day event. | writable |
| `start.dateTime` | `datetime` | The time, as a combined date-time value (formatted according to [RFC3339](https://tools.ietf.org/html/rfc3339)). A time zone offset is required unless a time zone is explicitly specified in `timeZone`. | writable |
| `start.timeZone` | `string` | The time zone in which the time is specified. (Formatted as an IANA Time Zone Database name, e.g. "Europe/Zurich".) For recurring events this field is required and specifies the time zone in which the recurrence is expanded. For single events this field is optional and indicates a custom time zone for the event start/end. | writable |
| `status` | `string` | Status of the event. Optional. Possible values are:  * "`confirmed`" - The event is confirmed. This is the default status. * "`tentative`" - The event is tentatively confirmed. * "`cancelled`" - The event is cancelled (deleted). The [list](/calendar/v3/reference/events/list) method returns cancelled events only on incremental sync (when `syncToken` or `updatedMin` are specified) or if the `showDeleted` flag is set to `true`. The [get](/calendar/v3/reference/events/get) method always returns them. A cancelled status represents two different states depending on the event type:    1. Cancelled exceptions of an uncancelled recurring event indicate that this instance should no longer be presented to the user. Clients should store these events for the lifetime of the parent recurring event. Cancelled exceptions are only guaranteed to have values for the `id`, `recurringEventId` and `originalStartTime` fields populated. The other fields might be empty.   2. All other cancelled events represent deleted events. Clients should remove their locally synced copies. Such cancelled events will eventually disappear, so do not rely on them being available indefinitely. Deleted events are only guaranteed to have the `id` field populated.On the organizer's calendar, cancelled events continue to expose event details (summary, location, etc.) so that they can be restored (undeleted). Similarly, the events to which the user was invited and that they manually removed continue to provide details. However, incremental sync requests with `showDeleted` set to false will not return these details. If an event changes its organizer (for example via the [move](/calendar/v3/reference/events/move) operation) and the original organizer is not on the attendee list, it will leave behind a cancelled event where only the `id` field is guaranteed to be populated. | writable |
| `summary` | `string` | Title of the event. | writable |
| `transparency` | `string` | Whether the event blocks time on the calendar. Optional. Possible values are:  * "`opaque`" - Default value. The event does block time on the calendar. This is equivalent to setting **Show me as** to **Busy** in the Calendar UI. * "`transparent`" - The event does not block time on the calendar. This is equivalent to setting **Show me as** to **Available** in the Calendar UI. | writable |
| `updated` | `datetime` | Last modification time of the main event data (as a [RFC3339](https://tools.ietf.org/html/rfc3339) timestamp). Updating event reminders will not cause this to change. Read-only. |  |
| `visibility` | `string` | Visibility of the event. Optional. Possible values are:  * "`default`" - Uses the default visibility for events on the calendar. This is the default value. * "`public`" - The event is public and event details are visible to all readers of the calendar. * "`private`" - The event is private and only event attendees may view event details. * "`confidential`" - The event is private. This value is provided for compatibility reasons. | writable |
| `workingLocationProperties` | `nested object` | Working location event data. | writable |
| `workingLocationProperties.customLocation` | `object` | If present, specifies that the user is working from a custom location. | writable |
| `workingLocationProperties.customLocation.label` | `string` | An optional extra label for additional information. | writable |
| `workingLocationProperties.homeOffice` | `any value` | If present, specifies that the user is working at home. | writable |
| `workingLocationProperties.officeLocation` | `object` | If present, specifies that the user is working from an office. | writable |
| `workingLocationProperties.officeLocation.buildingId` | `string` | An optional building identifier. This should reference a building ID in the organization's Resources database. | writable |
| `workingLocationProperties.officeLocation.deskId` | `string` | An optional desk identifier. | writable |
| `workingLocationProperties.officeLocation.floorId` | `string` | An optional floor identifier. | writable |
| `workingLocationProperties.officeLocation.floorSectionId` | `string` | An optional floor section identifier. | writable |
| `workingLocationProperties.officeLocation.label` | `string` | The office name that's displayed in Calendar Web and Mobile clients. We recommend you reference a building name in the organization's Resources database. | writable |
| `workingLocationProperties.type` | `string` | Type of the working location. Possible values are:  * "`homeOffice`" - The user is working at home. * "`officeLocation`" - The user is working from an office. * "`customLocation`" - The user is working from a custom location.  Any details are specified in a sub-field of the specified name, but this field may be missing if empty. Any other fields are ignored. Required when adding working location properties. | writable |

## Methods

[delete](/workspace/calendar/api/v3/reference/events/delete)
:   Deletes an event.

[get](/workspace/calendar/api/v3/reference/events/get)
:   Returns an event based on its Google Calendar ID. To retrieve an event using its iCalendar ID, call the [events.list method using the `iCalUID` parameter](/workspace/calendar/api/v3/reference/events/list#iCalUID).

[import](/workspace/calendar/api/v3/reference/events/import)
:   Imports an event. This operation is used to add a private copy of an existing event to a calendar. Only events with an `eventType` of `default` may be imported.

    **Deprecated behavior:** If a non-`default` event is imported, its type will be changed to `default` and any event-type-specific properties it may have will be dropped.

[insert](/workspace/calendar/api/v3/reference/events/insert)
:   Creates an event.

[instances](/workspace/calendar/api/v3/reference/events/instances)
:   Returns instances of the specified recurring event.

[list](/workspace/calendar/api/v3/reference/events/list)
:   Returns events on the specified calendar.

[move](/workspace/calendar/api/v3/reference/events/move)
:   Moves an event to another calendar, i.e. changes an event's organizer. Note that only `default` events can be moved; `birthday`, `focusTime`, `fromGmail`, `outOfOffice` and `workingLocation` events cannot be moved.

[patch](/workspace/calendar/api/v3/reference/events/patch)
:   Updates an event. This method supports patch semantics. Note that each patch request consumes three quota units; prefer using a `get` followed by an `update`. The field values you specify replace the existing values. Fields that you don't specify in the request remain unchanged. Array fields, if specified, overwrite the existing arrays; this discards any previous array elements.

[quickAdd](/workspace/calendar/api/v3/reference/events/quickAdd)
:   Creates an event based on a simple text string.

[update](/workspace/calendar/api/v3/reference/events/update)
:   Updates an event. This method does not support patch semantics and always updates the entire event resource. To do a partial update, perform a `get` followed by an `update` using etags to ensure atomicity.

[watch](/workspace/calendar/api/v3/reference/events/watch)
:   Watch for changes to Events resources.




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/api/quickstart/python

Send feedback

# Python quickstart Stay organized with collections Save and categorize content based on your preferences.

Create a Python command-line application that makes requests to the
Google Calendar API.

Quickstarts explain how to set up and run an app that calls a
Google Workspace API. This quickstart uses a
simplified authentication approach that is appropriate for a testing
environment. For a production environment, we recommend learning about
[authentication and authorization](/workspace/guides/auth-overview)
before
[choosing the access credentials](/workspace/guides/create-credentials#choose_the_access_credential_that_is_right_for_you)
that are appropriate for your app.

This quickstart uses Google Workspace's recommended API client libraries
to handle some details of the authentication and authorization flow.

## Objectives

* Set up your environment.
* Install the client library.
* Set up the sample.
* Run the sample.

## Prerequisites

To run this quickstart, you need the following prerequisites:

* Python 3.10.7 or greater
* The [pip](https://pypi.python.org/pypi/pip)
  package management tool
* [A Google Cloud project](/workspace/guides/create-project).

* A Google account with Google Calendar enabled.

## Set up your environment

To complete this quickstart, set up your environment.

### Enable the API

Before using Google APIs, you need to turn them on in a Google Cloud project.
You can turn on one or more APIs in a single Google Cloud project.

* In the Google Cloud console, enable the Google Calendar API.

  [Enable the API](https://console.cloud.google.com/flows/enableapi?apiid=calendar-json.googleapis.com)

### Configure the OAuth consent screen

If you're using a new Google Cloud project to complete this quickstart, configure
the OAuth consent screen. If you've already
completed this step for your Cloud project, skip to the next section.

1. In the Google Cloud console, go to Menu menu
   > **Google Auth platform**
   > **Branding**.

   [Go to Branding](https://console.cloud.google.com/auth/branding)
2. If you have already configured the Google Auth platform, you can configure the following OAuth Consent Screen settings in [Branding](https://console.cloud.google.com/auth/branding), [Audience](https://console.cloud.google.com/auth/audience), and [Data Access](https://console.cloud.google.com/auth/scopes). If you see a message that says **Google Auth platform not configured yet**, click **Get Started**:

1. Under **App Information**, in **App name**, enter a name for the app.
2. In **User support email**, choose a support email address where users can contact you if they have questions about their consent.
3. Click **Next**.
4. Under **Audience**, select **Internal**.
5. Click **Next**.
6. Under **Contact Information**, enter an **Email address** where you can be notified about any changes to your project.
7. Click **Next**.
8. Under **Finish**, review the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy) and if you agree, select **I agree to the Google API Services: User Data Policy**.
9. Click **Continue**.
10. Click **Create**.

3. For now, you can skip adding scopes.
   In the future, when you create an app for use outside of your
   Google Workspace organization, you must change the **User type** to **External**. Then
   add the authorization scopes that your app requires. To learn more, see the full
   [Configure OAuth consent](/workspace/guides/configure-oauth-consent) guide.

### Authorize credentials for a desktop application

To authenticate end users and access user data in your app, you need to
create one or more OAuth 2.0 Client IDs. A client ID is used to identify a
single app to Google's OAuth servers. If your app runs on multiple platforms,
you must create a separate client ID for each platform.

1. In the Google Cloud console, go to Menu menu
   > **Google Auth platform**
   > **Clients**.

   [Go to Clients](https://console.cloud.google.com/auth/clients)
2. Click **Create Client**.
3. Click **Application type** > **Desktop app**.
4. In the **Name** field, type a name for the credential. This name is only shown in the Google Cloud console.
5. Click **Create**.

   The newly created credential appears under "OAuth 2.0 Client IDs."
6. Save the downloaded JSON file as `credentials.json`, and move the
   file to your working directory.

## Install the Google client library

* Install the Google client library for Python:

  ```
  pip install --upgrade google-api-python-client google-auth-httplib2 google-auth-oauthlib
  ```

## Configure the sample

1. In your working directory, create a file named `quickstart.py`.
2. Include the following code in `quickstart.py`:

   calendar/quickstart/quickstart.py

   [View on GitHub](https://github.com/googleworkspace/python-samples/blob/main/calendar/quickstart/quickstart.py)

   ```
   import datetime
   import os.path

   from google.auth.transport.requests import Request
   from google.oauth2.credentials import Credentials
   from google_auth_oauthlib.flow import InstalledAppFlow
   from googleapiclient.discovery import build
   from googleapiclient.errors import HttpError

   # If modifying these scopes, delete the file token.json.
   SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"]


   def main():
     """Shows basic usage of the Google Calendar API.
     Prints the start and name of the next 10 events on the user's calendar.
     """
     creds = None
     # The file token.json stores the user's access and refresh tokens, and is
     # created automatically when the authorization flow completes for the first
     # time.
     if os.path.exists("token.json"):
       creds = Credentials.from_authorized_user_file("token.json", SCOPES)
     # If there are no (valid) credentials available, let the user log in.
     if not creds or not creds.valid:
       if creds and creds.expired and creds.refresh_token:
         creds.refresh(Request())
       else:
         flow = InstalledAppFlow.from_client_secrets_file(
             "credentials.json", SCOPES
         )
         creds = flow.run_local_server(port=0)
       # Save the credentials for the next run
       with open("token.json", "w") as token:
         token.write(creds.to_json())

     try:
       service = build("calendar", "v3", credentials=creds)

       # Call the Calendar API
       now = datetime.datetime.now(tz=datetime.timezone.utc).isoformat()
       print("Getting the upcoming 10 events")
       events_result = (
           service.events()
           .list(
               calendarId="primary",
               timeMin=now,
               maxResults=10,
               singleEvents=True,
               orderBy="startTime",
           )
           .execute()
       )
       events = events_result.get("items", [])

       if not events:
         print("No upcoming events found.")
         return

       # Prints the start and name of the next 10 events
       for event in events:
         start = event["start"].get("dateTime", event["start"].get("date"))
         print(start, event["summary"])

     except HttpError as error:
       print(f"An error occurred: {error}")


   if __name__ == "__main__":
     main()
   ```

## Run the sample

1. In your working directory, build and run the sample:

   ```
   python3 quickstart.py
   ```

2. The first time you run the sample, it prompts you to authorize access:
   1. If you're not already signed in to your Google Account, sign in when prompted. If
      you're signed in to multiple accounts, select one account to use for authorization.
   2. Click **Accept**.

   Your Python application runs and calls the Google Calendar API.

   Authorization information is stored in the file system, so the next time you run the sample
   code, you aren't prompted for authorization.

## Next steps

* [Try the Google Workspace APIs in the APIs explorer](/workspace/explore)

* [Create events](/workspace/calendar/create-events)
* [Troubleshoot authentication and authorization issues](/workspace/calendar/api/troubleshoot-authentication-authorization)
* [Calendar API reference documentation](/workspace/calendar/v3/reference)
* [Google APIs Client for Python documentation](/api-client-library/python)
* [Google Calendar API PyDoc documentation](https://developers.google.com/resources/api-libraries/documentation/calendar/v3/python/latest/index%2Ehtml)




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/concepts/sharing

Send feedback

# Calendar sharing Stay organized with collections Save and categorize content based on your preferences.

There are two different ways to share calendar and event data with others.

Firstly, you can *share* an entire calendar, with a specified level of access.
For example, you can create a team calendar, and then do things like:

* Grant all members of your team the right to add and modify events in the
  calendar
* Grant your boss the right to see the events on your calendar
* Grant your customers the right to only see when you are free or busy, but not
  the details of the events

You can also adjust the access to individual events on the shared calendar.

Alternatively, you can invite others to individual events on your calendar.
Inviting someone to an event puts a copy of that event on their calendar. The
copy on the attendee's calendar is visible to others according to the
attendee's sharing configuration.
The invitee can then accept or reject the invitation, and to some extent also
modify their copy of the event — for example, change the color it has in
their calendar, and add a reminder. [Learn more about inviting users to an
event](/workspace/calendar/api/concepts/inviting-attendees-to-events).

## Sharing calendars

The owners of a calendar can share the calendar by giving access to other
users. The sharing settings of a given calendar are represented by the [ACL
collection](/workspace/calendar/v3/reference/acl)
(access control list) of that calendar. Each resource in the ACL
collection grants a specified *grantee* a certain access *role*, which is
one of those listed in the following table:

| Role | Access privilege granted by the role |
| --- | --- |
| `none` | Provides no access. |
| `freeBusyReader` | Lets the grantee see whether the calendar is free or busy at a given time, but does not allow access to event details. Free/busy information can be retrieved using the [freeBusy.query](/workspace/calendar/v3/reference/freebusy/query) operation. |
| `reader` | Lets the grantee read events on the calendar. |
| `writer` | Lets the grantee read and write events on the calendar. This role can also see ACLs. |
| `owner` | Provides manager access to the calendar. This role has all of the permissions of the writer role with the additional ability to modify access levels of other users. **Important:** the `owner` role is different from the calendar's data owner. A calendar has a single data owner, but can have multiple users with `owner` role. |

The possible grantees are:

* another individual user
* a user group
* a domain
* public (grants access to everyone).

By default, each user has owner access to their primary calendar, and this
access cannot be relinquished. Up to 6,000 ACLs can be added per calendar.

For Google Workspace users, there are also domain
settings that might restrict the
maximum allowed access. For example, suppose your domain has a setting that
only allows free-busy calendar sharing. In this case, even if you grant writer
access to the public, users outside the domain will only see the free-busy
details.

**Note:** Sharing a calendar with a user no longer automatically inserts the
calendar into their `CalendarList`. If you want the user to see and
interact with the shared calendar, you need to call the
[`CalendarList: insert()`](/workspace/calendar/v3/reference/calendarList/insert) method.

## Event visibility

Once the calendar is shared, you can adjust the access to individual
events on a calendar by changing the [visibility
property](/workspace/calendar/v3/reference/events#visibility) of the event.
This property has no meaning for non-shared calendars. The following table
lists the possible values of the visibility property:

| Visibility | Meaning |
| --- | --- |
| `default` | The visibility of the event is determined by the ACLs of the calendar. Different attendees of the same event can have different ACLs and sharing. If a user with a `private` calendar sends an invite to an event using `default` visibility to another user with a publicly visible calendar, the event is fully visible on that attendee's calendar. |
| `public` | The details of this event are visible to everyone with at least `freeBusyReader` access to the calendar. |
| `private` | The details of this event are only visible to users with at least `writer` access to the calendar. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/v3/reference/calendarList/insert

Send feedback

# CalendarList: insert Stay organized with collections Save and categorize content based on your preferences.

**Note:**
Requires [authorization](#auth).

Inserts an existing calendar into the user's calendar list.
[Try it now](#try-it).

## Request

### HTTP request

```
POST https://www.googleapis.com/calendar/v3/users/me/calendarList
```

### Parameters

| Parameter name | Value | Description |
| --- | --- | --- |
| **Optional query parameters** | | |
| `colorRgbFormat` | `boolean` | Whether to use the `foregroundColor` and `backgroundColor` fields to write the calendar colors (RGB). If this feature is used, the index-based `colorId` field will be set to the best matching option automatically. Optional. The default is False. |

### Authorization

This request requires authorization with at least one of the following scopes:

| Scope |
| --- |
| `https://www.googleapis.com/auth/calendar` |
| `https://www.googleapis.com/auth/calendar.calendarlist` |

For more information, see the [authentication and authorization](/workspace/guides/configure-oauth-consent) page.

### Request body

In the request body, supply a [CalendarList resource](/workspace/calendar/api/v3/reference/calendarList#resource) with the following properties:

| Property name | Value | Description | Notes |
| --- | --- | --- | --- |
| **Required Properties** | | | |
| `id` | `string` | Identifier of the calendar. |  |
| **Optional Properties** | | | |
| `backgroundColor` | `string` | The main color of the calendar in the hexadecimal format "`#0088aa`". This property supersedes the index-based `colorId` property. To set or change this property, you need to specify `colorRgbFormat=true` in the parameters of the [insert](/calendar/v3/reference/calendarList/insert), [update](/calendar/v3/reference/calendarList/update) and [patch](/calendar/v3/reference/calendarList/patch) methods. Optional. | writable |
| `colorId` | `string` | The color of the calendar. This is an ID referring to an entry in the `calendar` section of the colors definition (see the [colors endpoint](/calendar/v3/reference/colors)). This property is superseded by the `backgroundColor` and `foregroundColor` properties and can be ignored when using these properties. Optional. | writable |
| `defaultReminders[]` | `list` | The default reminders that the authenticated user has for this calendar. | writable |
| `defaultReminders[].method` | `string` | The method used by this reminder. Possible values are:  * "`email`" - Reminders are sent via email. * "`popup`" - Reminders are sent via a UI popup.   Required when adding a reminder. | writable |
| `defaultReminders[].minutes` | `integer` | Number of minutes before the start of the event when the reminder should trigger. Valid values are between 0 and 40320 (4 weeks in minutes). Required when adding a reminder. | writable |
| `foregroundColor` | `string` | The foreground color of the calendar in the hexadecimal format "`#ffffff`". This property supersedes the index-based `colorId` property. To set or change this property, you need to specify `colorRgbFormat=true` in the parameters of the [insert](/calendar/v3/reference/calendarList/insert), [update](/calendar/v3/reference/calendarList/update) and [patch](/calendar/v3/reference/calendarList/patch) methods. Optional. | writable |
| `hidden` | `boolean` | Whether the calendar has been hidden from the list. Optional. The attribute is only returned when the calendar is hidden, in which case the value is `true`. | writable |
| `notificationSettings` | `object` | The notifications that the authenticated user is receiving for this calendar. | writable |
| `notificationSettings.notifications[].method` | `string` | The method used to deliver the notification. The possible value is:  * "`email`" - Notifications are sent via email.   Required when adding a notification. | writable |
| `notificationSettings.notifications[].type` | `string` | The type of notification. Possible values are:  * "`eventCreation`" - Notification sent when a new event is put on the calendar. * "`eventChange`" - Notification sent when an event is changed. * "`eventCancellation`" - Notification sent when an event is cancelled. * "`eventResponse`" - Notification sent when an attendee responds to the event invitation. * "`agenda`" - An agenda with the events of the day (sent out in the morning).   Required when adding a notification. | writable |
| `selected` | `boolean` | Whether the calendar content shows up in the calendar UI. Optional. The default is False. | writable |
| `summaryOverride` | `string` | The summary that the authenticated user has set for this calendar. Optional. | writable |

## Response

If successful, this method returns a [CalendarList resource](/workspace/calendar/api/v3/reference/calendarList#resource) in the response body.




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/api/v3/reference/acl/insert

Send feedback

# Acl: insert Stay organized with collections Save and categorize content based on your preferences.

**Note:**
Requires [authorization](#auth).

Creates an access control rule.
[Try it now](#try-it).

## Request

### HTTP request

```
POST https://www.googleapis.com/calendar/v3/calendars/calendarId/acl
```

### Parameters

| Parameter name | Value | Description |
| --- | --- | --- |
| **Path parameters** | | |
| `calendarId` | `string` | Calendar identifier. To retrieve calendar IDs call the [calendarList.list](/workspace/calendar/api/v3/reference/calendarList/list) method. If you want to access the primary calendar of the currently logged in user, use the "`primary`" keyword. |
| **Optional query parameters** | | |
| `sendNotifications` | `boolean` | Whether to send notifications about the calendar sharing change. Optional. The default is True. |

### Authorization

This request requires authorization with at least one of the following scopes:

| Scope |
| --- |
| `https://www.googleapis.com/auth/calendar` |
| `https://www.googleapis.com/auth/calendar.acls` |

For more information, see the [authentication and authorization](/workspace/guides/configure-oauth-consent) page.

### Request body

In the request body, supply an [Acl resource](/workspace/calendar/api/v3/reference/acl#resource) with the following properties:

| Property name | Value | Description | Notes |
| --- | --- | --- | --- |
| **Required Properties** | | | |
| `role` | `string` | The role assigned to the scope. Possible values are:  * "`none`" - Provides no access. * "`freeBusyReader`" - Provides read access to free/busy information. * "`reader`" - Provides read access to the calendar. Private events will appear to users with reader access, but event details will be hidden. * "`writer`" - Provides read and write access to the calendar. Private events will appear to users with writer access, and event details will be visible. Provides read access to the calendar's ACLs. * "`owner`" - Provides manager access to the calendar. This role has all of the permissions of the writer role with the additional ability to modify access levels of other users.  Important: the `owner` role is different from the calendar's data owner. A calendar has a single data owner, but can have multiple users with `owner` role. | writable |
| `scope` | `object` | The extent to which [calendar access](https://developers.google.com/workspace/calendar/concepts/sharing#sharing_calendars) is granted by this ACL rule. |  |
| `scope.type` | `string` | The type of the scope. Possible values are:  * "`default`" - The public scope. This is the default value. * "`user`" - Limits the scope to a single user. * "`group`" - Limits the scope to a group. * "`domain`" - Limits the scope to a domain.  Note: The permissions granted to the "`default`", or public, scope apply to any user, authenticated or not. |  |
| **Optional Properties** | | | |
| `scope.value` | `string` | The email address of a user or group, or the name of a domain, depending on the scope type. Omitted for type "`default`". | writable |

## Response

If successful, this method returns an [Acl resource](/workspace/calendar/api/v3/reference/acl#resource) in the response body.




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/api/v3/reference/events/update

Send feedback

# Events: update Stay organized with collections Save and categorize content based on your preferences.

**Note:**
Requires [authorization](#auth).

Updates an event. This method does not support patch semantics and always updates the entire event resource. To do a partial update, perform a `get` followed by an `update` using etags to ensure atomicity.
[Try it now](#try-it).

## Request

### HTTP request

```
PUT https://www.googleapis.com/calendar/v3/calendars/calendarId/events/eventId
```

### Parameters

| Parameter name | Value | Description |
| --- | --- | --- |
| **Path parameters** | | |
| `calendarId` | `string` | Calendar identifier. To retrieve calendar IDs call the [calendarList.list](/workspace/calendar/api/v3/reference/calendarList/list) method. If you want to access the primary calendar of the currently logged in user, use the "`primary`" keyword. |
| `eventId` | `string` | Event identifier. |
| **Optional query parameters** | | |
| `alwaysIncludeEmail` | `boolean` | Deprecated and ignored. A value will always be returned in the `email` field for the organizer, creator and attendees, even if no real email address is available (i.e. a generated, non-working value will be provided). |
| `conferenceDataVersion` | `integer` | Version number of conference data supported by the API client. Version 0 assumes no conference data support and ignores conference data in the event's body. Version 1 enables support for copying of ConferenceData as well as for creating new conferences using the createRequest field of conferenceData. The default is 0. Acceptable values are `0` to `1`, inclusive. |
| `maxAttendees` | `integer` | The maximum number of attendees to include in the response. If there are more than the specified number of attendees, only the participant is returned. Optional. |
| `sendNotifications` | `boolean` | Deprecated. Please use [sendUpdates](/workspace/calendar/api/v3/reference/events/update#sendUpdates) instead.  Whether to send notifications about the event update (for example, description changes, etc.). Note that some emails might still be sent even if you set the value to `false`. The default is `false`. |
| `sendUpdates` | `string` | Guests who should receive notifications about the event update (for example, title changes, etc.).   Acceptable values are:  * "`all`": Notifications are sent to all guests. * "`externalOnly`": Notifications are sent to non-Google Calendar guests only. * "`none`": No notifications are sent. For calendar migration tasks, consider using the [Events.import](/workspace/calendar/api/v3/reference/events/import) method instead. |
| `supportsAttachments` | `boolean` | Whether API client performing operation supports event attachments. Optional. The default is False. |

### Authorization

This request requires authorization with at least one of the following scopes:

| Scope |
| --- |
| `https://www.googleapis.com/auth/calendar` |
| `https://www.googleapis.com/auth/calendar.events` |
| `https://www.googleapis.com/auth/calendar.app.created` |
| `https://www.googleapis.com/auth/calendar.events.owned` |

For more information, see the [authentication and authorization](/workspace/guides/configure-oauth-consent) page.

### Request body

In the request body, supply an [Events resource](/workspace/calendar/api/v3/reference/events#resource) with the following properties:

| Property name | Value | Description | Notes |
| --- | --- | --- | --- |
| **Required Properties** | | | |
| `end` | `nested object` | The (exclusive) end time of the event. For a recurring event, this is the end time of the first instance. |  |
| `start` | `nested object` | The (inclusive) start time of the event. For a recurring event, this is the start time of the first instance. |  |
| **Optional Properties** | | | |
| `anyoneCanAddSelf` | `boolean` | Whether anyone can invite themselves to the event (deprecated). Optional. The default is False. | writable |
| `attachments[].fileUrl` | `string` | URL link to the attachment. For adding Google Drive file attachments use the same format as in `alternateLink` property of the `Files` resource in the Drive API.  Required when adding an attachment. | writable |
| `attendees[]` | `list` | The attendees of the event. See the [Events with attendees](/calendar/concepts/sharing) guide for more information on scheduling events with other calendar users. Service accounts need to use [domain-wide delegation of authority](/calendar/auth#perform-g-suite-domain-wide-delegation-of-authority) to populate the attendee list. | writable |
| `attendees[].additionalGuests` | `integer` | Number of additional guests. Optional. The default is 0. | writable |
| `attendees[].comment` | `string` | The attendee's response comment. Optional. | writable |
| `attendees[].displayName` | `string` | The attendee's name, if available. Optional. | writable |
| `attendees[].email` | `string` | The attendee's email address, if available. This field must be present when adding an attendee. It must be a valid email address as per [RFC5322](https://tools.ietf.org/html/rfc5322#section-3.4). Required when adding an attendee. | writable |
| `attendees[].optional` | `boolean` | Whether this is an optional attendee. Optional. The default is False. | writable |
| `attendees[].resource` | `boolean` | Whether the attendee is a resource. Can only be set when the attendee is added to the event for the first time. Subsequent modifications are ignored. Optional. The default is False. | writable |
| `attendees[].responseStatus` | `string` | The attendee's response status. Possible values are:  * "`needsAction`" - The attendee has not responded to the invitation (recommended for new events). * "`declined`" - The attendee has declined the invitation. * "`tentative`" - The attendee has tentatively accepted the invitation. * "`accepted`" - The attendee has accepted the invitation.  **Warning:** If you add an event using the values `declined`, `tentative`, or `accepted`, attendees with the "Add invitations to my calendar" setting set to "When I respond to invitation in email" or "Only if the sender is known" might have their response reset to `needsAction` and won't see an event in their calendar unless they change their response in the event invitation email. Furthermore, if more than 200 guests are invited to the event, response status is not propagated to the guests. | writable |
| `attendeesOmitted` | `boolean` | Whether attendees may have been omitted from the event's representation. When retrieving an event, this may be due to a restriction specified by the `maxAttendee` query parameter. When updating an event, this can be used to only update the participant's response. Optional. The default is False. | writable |
| `colorId` | `string` | The color of the event. This is an ID referring to an entry in the `event` section of the colors definition (see the  [colors endpoint](/calendar/v3/reference/colors)). Optional. | writable |
| `conferenceData` | `nested object` | The conference-related information, such as details of a Google Meet conference. To create new conference details use the `createRequest` field. To persist your changes, remember to set the `conferenceDataVersion` request parameter to `1` for all event modification requests. **Warning:** Reusing Google Meet conference data across different events can cause access issues and expose meeting details to unintended users. To help ensure meeting privacy, always generate a unique conference for each event by using the `createRequest` field. | writable |
| `description` | `string` | Description of the event. Can contain HTML. Optional. | writable |
| `end.date` | `date` | The date, in the format "yyyy-mm-dd", if this is an all-day event. | writable |
| `end.dateTime` | `datetime` | The time, as a combined date-time value (formatted according to [RFC3339](https://tools.ietf.org/html/rfc3339)). A time zone offset is required unless a time zone is explicitly specified in `timeZone`. | writable |
| `end.timeZone` | `string` | The time zone in which the time is specified. (Formatted as an IANA Time Zone Database name, e.g. "Europe/Zurich".) For recurring events this field is required and specifies the time zone in which the recurrence is expanded. For single events this field is optional and indicates a custom time zone for the event start/end. | writable |
| `extendedProperties.private` | `object` | Properties that are private to the copy of the event that appears on this calendar. | writable |
| `extendedProperties.shared` | `object` | Properties that are shared between copies of the event on other attendees' calendars. | writable |
| `focusTimeProperties` | `nested object` | Focus Time event data. Used if `eventType` is `focusTime`. | writable |
| `gadget.display` | `string` | The gadget's display mode. Deprecated. Possible values are:  * "`icon`" - The gadget displays next to the event's title in the calendar view. * "`chip`" - The gadget displays when the event is clicked. | writable |
| `gadget.height` | `integer` | The gadget's height in pixels. The height must be an integer greater than 0. Optional. Deprecated. | writable |
| `gadget.iconLink` | `string` | The gadget's icon URL. The URL scheme must be HTTPS. Deprecated. | writable |
| `gadget.link` | `string` | The gadget's URL. The URL scheme must be HTTPS. Deprecated. | writable |
| `gadget.preferences` | `object` | Preferences. | writable |
| `gadget.title` | `string` | The gadget's title. Deprecated. | writable |
| `gadget.type` | `string` | The gadget's type. Deprecated. | writable |
| `gadget.width` | `integer` | The gadget's width in pixels. The width must be an integer greater than 0. Optional. Deprecated. | writable |
| `guestsCanInviteOthers` | `boolean` | Whether attendees other than the organizer can invite others to the event. Optional. The default is True. | writable |
| `guestsCanModify` | `boolean` | Whether attendees other than the organizer can modify the event. Optional. The default is False. | writable |
| `guestsCanSeeOtherGuests` | `boolean` | Whether attendees other than the organizer can see who the event's attendees are. Optional. The default is True. | writable |
| `location` | `string` | Geographic location of the event as free-form text. Optional. | writable |
| `originalStartTime.date` | `date` | The date, in the format "yyyy-mm-dd", if this is an all-day event. | writable |
| `originalStartTime.dateTime` | `datetime` | The time, as a combined date-time value (formatted according to [RFC3339](https://tools.ietf.org/html/rfc3339)). A time zone offset is required unless a time zone is explicitly specified in `timeZone`. | writable |
| `originalStartTime.timeZone` | `string` | The time zone in which the time is specified. (Formatted as an IANA Time Zone Database name, e.g. "Europe/Zurich".) For recurring events this field is required and specifies the time zone in which the recurrence is expanded. For single events this field is optional and indicates a custom time zone for the event start/end. | writable |
| `outOfOfficeProperties` | `nested object` | Out of office event data. Used if `eventType` is `outOfOffice`. | writable |
| `recurrence[]` | `list` | List of RRULE, EXRULE, RDATE and EXDATE lines for a recurring event, as specified in [RFC5545](http://tools.ietf.org/html/rfc5545#section-3.8.5). Note that DTSTART and DTEND lines are not allowed in this field; event start and end times are specified in the `start` and `end` fields. This field is omitted for single events or instances of recurring events. | writable |
| `reminders.overrides[]` | `list` | If the event doesn't use the default reminders, this lists the reminders specific to the event, or, if not set, indicates that no reminders are set for this event. The maximum number of override reminders is 5. | writable |
| `reminders.overrides[].method` | `string` | The method used by this reminder. Possible values are:  * "`email`" - Reminders are sent via email. * "`popup`" - Reminders are sent via a UI popup.   Required when adding a reminder. | writable |
| `reminders.overrides[].minutes` | `integer` | Number of minutes before the start of the event when the reminder should trigger. Valid values are between 0 and 40320 (4 weeks in minutes). Required when adding a reminder. | writable |
| `reminders.useDefault` | `boolean` | Whether the default reminders of the calendar apply to the event. | writable |
| `sequence` | `integer` | Sequence number as per iCalendar. | writable |
| `source.title` | `string` | Title of the source; for example a title of a web page or an email subject. | writable |
| `source.url` | `string` | URL of the source pointing to a resource. The URL scheme must be HTTP or HTTPS. | writable |
| `start.date` | `date` | The date, in the format "yyyy-mm-dd", if this is an all-day event. | writable |
| `start.dateTime` | `datetime` | The time, as a combined date-time value (formatted according to [RFC3339](https://tools.ietf.org/html/rfc3339)). A time zone offset is required unless a time zone is explicitly specified in `timeZone`. | writable |
| `start.timeZone` | `string` | The time zone in which the time is specified. (Formatted as an IANA Time Zone Database name, e.g. "Europe/Zurich".) For recurring events this field is required and specifies the time zone in which the recurrence is expanded. For single events this field is optional and indicates a custom time zone for the event start/end. | writable |
| `status` | `string` | Status of the event. Optional. Possible values are:  * "`confirmed`" - The event is confirmed. This is the default status. * "`tentative`" - The event is tentatively confirmed. * "`cancelled`" - The event is cancelled (deleted). The [list](/calendar/v3/reference/events/list) method returns cancelled events only on incremental sync (when `syncToken` or `updatedMin` are specified) or if the `showDeleted` flag is set to `true`. The [get](/calendar/v3/reference/events/get) method always returns them. A cancelled status represents two different states depending on the event type:    1. Cancelled exceptions of an uncancelled recurring event indicate that this instance should no longer be presented to the user. Clients should store these events for the lifetime of the parent recurring event. Cancelled exceptions are only guaranteed to have values for the `id`, `recurringEventId` and `originalStartTime` fields populated. The other fields might be empty.   2. All other cancelled events represent deleted events. Clients should remove their locally synced copies. Such cancelled events will eventually disappear, so do not rely on them being available indefinitely. Deleted events are only guaranteed to have the `id` field populated.On the organizer's calendar, cancelled events continue to expose event details (summary, location, etc.) so that they can be restored (undeleted). Similarly, the events to which the user was invited and that they manually removed continue to provide details. However, incremental sync requests with `showDeleted` set to false will not return these details. If an event changes its organizer (for example via the [move](/calendar/v3/reference/events/move) operation) and the original organizer is not on the attendee list, it will leave behind a cancelled event where only the `id` field is guaranteed to be populated. | writable |
| `summary` | `string` | Title of the event. | writable |
| `transparency` | `string` | Whether the event blocks time on the calendar. Optional. Possible values are:  * "`opaque`" - Default value. The event does block time on the calendar. This is equivalent to setting **Show me as** to **Busy** in the Calendar UI. * "`transparent`" - The event does not block time on the calendar. This is equivalent to setting **Show me as** to **Available** in the Calendar UI. | writable |
| `visibility` | `string` | Visibility of the event. Optional. Possible values are:  * "`default`" - Uses the default visibility for events on the calendar. This is the default value. * "`public`" - The event is public and event details are visible to all readers of the calendar. * "`private`" - The event is private and only event attendees may view event details. * "`confidential`" - The event is private. This value is provided for compatibility reasons. | writable |
| `workingLocationProperties` | `nested object` | Working location event data. | writable |
| `workingLocationProperties.customLocation` | `object` | If present, specifies that the user is working from a custom location. | writable |
| `workingLocationProperties.customLocation.label` | `string` | An optional extra label for additional information. | writable |
| `workingLocationProperties.homeOffice` | `any value` | If present, specifies that the user is working at home. | writable |
| `workingLocationProperties.officeLocation` | `object` | If present, specifies that the user is working from an office. | writable |
| `workingLocationProperties.officeLocation.buildingId` | `string` | An optional building identifier. This should reference a building ID in the organization's Resources database. | writable |
| `workingLocationProperties.officeLocation.deskId` | `string` | An optional desk identifier. | writable |
| `workingLocationProperties.officeLocation.floorId` | `string` | An optional floor identifier. | writable |
| `workingLocationProperties.officeLocation.floorSectionId` | `string` | An optional floor section identifier. | writable |
| `workingLocationProperties.officeLocation.label` | `string` | The office name that's displayed in Calendar Web and Mobile clients. We recommend you reference a building name in the organization's Resources database. | writable |
| `workingLocationProperties.type` | `string` | Type of the working location. Possible values are:  * "`homeOffice`" - The user is working at home. * "`officeLocation`" - The user is working from an office. * "`customLocation`" - The user is working from a custom location.  Any details are specified in a sub-field of the specified name, but this field may be missing if empty. Any other fields are ignored. Required when adding working location properties. | writable |

## Response

If successful, this method returns an [Events resource](/workspace/calendar/api/v3/reference/events#resource) in the response body.




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/api/v3/reference/channels

Send feedback

# Channels Stay organized with collections Save and categorize content based on your preferences.

For a list of [methods](#methods) for this resource, see the end of this page.

## Resource representations

There is no persistent data associated with this resource.

## Methods

[stop](/workspace/calendar/api/v3/reference/channels/stop)
:   Stop watching resources through this channel.




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/api/v3/reference/calendarList/list

Send feedback

# CalendarList: list Stay organized with collections Save and categorize content based on your preferences.

**Note:**
Requires [authorization](#auth).

Returns the calendars on the user's calendar list.
[Try it now](#try-it).

## Request

### HTTP request

```
GET https://www.googleapis.com/calendar/v3/users/me/calendarList
```

### Parameters

| Parameter name | Value | Description |
| --- | --- | --- |
| **Optional query parameters** | | |
| `maxResults` | `integer` | Maximum number of entries returned on one result page. By default the value is 100 entries. The page size can never be larger than 250 entries. Optional. |
| `minAccessRole` | `string` | The minimum access role for the user in the returned entries. Optional. The default is no restriction.   Acceptable values are:  * "`freeBusyReader`": The user can read free/busy information. * "`owner`": The user can read and modify events and access control lists. * "`reader`": The user can read events that are not private. * "`writer`": The user can read and modify events. |
| `pageToken` | `string` | Token specifying which result page to return. Optional. |
| `showDeleted` | `boolean` | Whether to include deleted calendar list entries in the result. Optional. The default is False. |
| `showHidden` | `boolean` | Whether to show hidden entries. Optional. The default is False. |
| `syncToken` | `string` | Token obtained from the `nextSyncToken` field returned on the last page of results from the previous list request. It makes the result of this list request contain only entries that have changed since then. If only read-only fields such as calendar properties or ACLs have changed, the entry won't be returned. All entries deleted and hidden since the previous list request will always be in the result set and it is not allowed to set `showDeleted` neither `showHidden` to False.  To ensure client state consistency `minAccessRole` query parameter cannot be specified together with `nextSyncToken`.  If the `syncToken` expires, the server will respond with a 410 GONE response code and the client should clear its storage and perform a full synchronization without any `syncToken`.  [Learn more](/workspace/calendar/api/guides/sync) about incremental synchronization.  Optional. The default is to return all entries. |

### Authorization

This request requires authorization with at least one of the following scopes:

| Scope |
| --- |
| `https://www.googleapis.com/auth/calendar.readonly` |
| `https://www.googleapis.com/auth/calendar` |
| `https://www.googleapis.com/auth/calendar.calendarlist` |
| `https://www.googleapis.com/auth/calendar.calendarlist.readonly` |

For more information, see the [authentication and authorization](/workspace/guides/configure-oauth-consent) page.

### Request body

Do not supply a request body with this method.

## Response

If successful, this method returns a response body with the following structure:

```
{
  "kind": "calendar#calendarList",
  "etag": etag,
  "nextPageToken": string,
  "nextSyncToken": string,
  "items": [
    calendarList Resource
  ]
}
```

| Property name | Value | Description | Notes |
| --- | --- | --- | --- |
| `kind` | `string` | Type of the collection ("`calendar#calendarList`"). |  |
| `etag` | `etag` | ETag of the collection. |  |
| `nextPageToken` | `string` | Token used to access the next page of this result. Omitted if no further results are available, in which case `nextSyncToken` is provided. |  |
| `items[]` | `list` | Calendars that are present on the user's calendar list. |  |
| `nextSyncToken` | `string` | Token used at a later point in time to retrieve only the entries that have changed since this result was returned. Omitted if further results are available, in which case `nextPageToken` is provided. |  |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/api/v3/reference/calendars/insert

Send feedback

# Calendars: insert Stay organized with collections Save and categorize content based on your preferences.

**Note:**
Requires [authorization](#auth).

Creates a secondary calendar.

The authenticated user for the request is made the data owner of the new calendar.

**Note:** We recommend to authenticate as the intended data owner of the calendar. You can use [domain-wide delegation of authority](/workspace/cloud-search/docs/guides/delegation) to allow applications to act on behalf of a specific user. Don't use a service account for authentication. If you use a service account for authentication, the service account is the data owner, which can lead to unexpected behavior. For example, if a service account is the data owner, data ownership cannot be transferred.[Try it now](#try-it).

## Request

### HTTP request

```
POST https://www.googleapis.com/calendar/v3/calendars
```

### Authorization

This request requires authorization with at least one of the following scopes:

| Scope |
| --- |
| `https://www.googleapis.com/auth/calendar` |
| `https://www.googleapis.com/auth/calendar.app.created` |
| `https://www.googleapis.com/auth/calendar.calendars` |

For more information, see the [authentication and authorization](/workspace/guides/configure-oauth-consent) page.

### Request body

In the request body, supply a [Calendars resource](/workspace/calendar/api/v3/reference/calendars#resource) with the following properties:

| Property name | Value | Description | Notes |
| --- | --- | --- | --- |
| **Required Properties** | | | |
| `summary` | `string` | Title of the calendar. | writable |

## Response

If successful, this method returns a [Calendars resource](/workspace/calendar/api/v3/reference/calendars#resource) in the response body.




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/api/v3/reference/acl

Send feedback

# Acl Stay organized with collections Save and categorize content based on your preferences.

For a list of [methods](#methods) for this resource, see the end of this page.

## Resource representations

```
{
  "kind": "calendar#aclRule",
  "etag": etag,
  "id": string,
  "scope": {
    "type": string,
    "value": string
  },
  "role": string
}
```

| Property name | Value | Description | Notes |
| --- | --- | --- | --- |
| `etag` | `etag` | ETag of the resource. |  |
| `id` | `string` | Identifier of the Access Control List (ACL) rule. See [Sharing calendars](https://developers.google.com/workspace/calendar/concepts/sharing#sharing_calendars). |  |
| `kind` | `string` | Type of the resource ("`calendar#aclRule`"). |  |
| `role` | `string` | The role assigned to the scope. Possible values are:  * "`none`" - Provides no access. * "`freeBusyReader`" - Provides read access to free/busy information. * "`reader`" - Provides read access to the calendar. Private events will appear to users with reader access, but event details will be hidden. * "`writer`" - Provides read and write access to the calendar. Private events will appear to users with writer access, and event details will be visible. Provides read access to the calendar's ACLs. * "`owner`" - Provides manager access to the calendar. This role has all of the permissions of the writer role with the additional ability to modify access levels of other users.  Important: the `owner` role is different from the calendar's data owner. A calendar has a single data owner, but can have multiple users with `owner` role. | writable |
| `scope` | `object` | The extent to which [calendar access](https://developers.google.com/workspace/calendar/concepts/sharing#sharing_calendars) is granted by this ACL rule. |  |
| `scope.type` | `string` | The type of the scope. Possible values are:  * "`default`" - The public scope. This is the default value. * "`user`" - Limits the scope to a single user. * "`group`" - Limits the scope to a group. * "`domain`" - Limits the scope to a domain.  Note: The permissions granted to the "`default`", or public, scope apply to any user, authenticated or not. |  |
| `scope.value` | `string` | The email address of a user or group, or the name of a domain, depending on the scope type. Omitted for type "`default`". | writable |

## Methods

[delete](/workspace/calendar/api/v3/reference/acl/delete)
:   Deletes an access control rule.

[get](/workspace/calendar/api/v3/reference/acl/get)
:   Returns an access control rule.

[insert](/workspace/calendar/api/v3/reference/acl/insert)
:   Creates an access control rule.

[list](/workspace/calendar/api/v3/reference/acl/list)
:   Returns the rules in the access control list for the calendar.

[patch](/workspace/calendar/api/v3/reference/acl/patch)
:   Updates an access control rule. This method supports patch semantics. Note that each patch request consumes three quota units; prefer using a `get` followed by an `update`. The field values you specify replace the existing values. Fields that you don't specify in the request remain unchanged. Array fields, if specified, overwrite the existing arrays; this discards any previous array elements.

[update](/workspace/calendar/api/v3/reference/acl/update)
:   Updates an access control rule.

[watch](/workspace/calendar/api/v3/reference/acl/watch)
:   Watch for changes to ACL resources.




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/api/v3/reference/calendars/clear

Send feedback

# Calendars: clear Stay organized with collections Save and categorize content based on your preferences.

**Note:**
Requires [authorization](#auth).

Clears a primary calendar. This operation deletes all events associated with the primary calendar of an account.
[Try it now](#try-it).

## Request

### HTTP request

```
POST https://www.googleapis.com/calendar/v3/calendars/calendarId/clear
```

### Parameters

| Parameter name | Value | Description |
| --- | --- | --- |
| **Path parameters** | | |
| `calendarId` | `string` | Calendar identifier. To retrieve calendar IDs call the [calendarList.list](/workspace/calendar/api/v3/reference/calendarList/list) method. If you want to access the primary calendar of the currently logged in user, use the "`primary`" keyword. |

### Authorization

This request requires authorization with at least one of the following scopes:

| Scope |
| --- |
| `https://www.googleapis.com/auth/calendar` |
| `https://www.googleapis.com/auth/calendar.calendars` |

For more information, see the [authentication and authorization](/workspace/guides/configure-oauth-consent) page.

### Request body

Do not supply a request body with this method.

## Response

If successful, this method returns an empty response body.




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/api/v3/reference/events/list

Send feedback

# Events: list Stay organized with collections Save and categorize content based on your preferences.

**Note:**
[Authorization](#auth) optional.

Returns events on the specified calendar.
[Try it now](#try-it).

## Request

### HTTP request

```
GET https://www.googleapis.com/calendar/v3/calendars/calendarId/events
```

### Parameters

| Parameter name | Value | Description |
| --- | --- | --- |
| **Path parameters** | | |
| `calendarId` | `string` | Calendar identifier. To retrieve calendar IDs call the [calendarList.list](/workspace/calendar/api/v3/reference/calendarList/list) method. If you want to access the primary calendar of the currently logged in user, use the "`primary`" keyword. |
| **Optional query parameters** | | |
| `alwaysIncludeEmail` | `boolean` | Deprecated and ignored. |
| `eventTypes` | `string` | Event types to return. Optional. This parameter can be repeated multiple times to return events of different types. If unset, returns all event types.   Acceptable values are:  * "`birthday`": Special all-day events with an annual recurrence. * "`default`": Regular events. * "`focusTime`": Focus time events. * "`fromGmail`": Events from Gmail. * "`outOfOffice`": Out of office events. * "`workingLocation`": Working location events. |
| `iCalUID` | `string` | Specifies an event ID in the iCalendar format to be provided in the response. Optional. Use this if you want to search for an event by its iCalendar ID. |
| `maxAttendees` | `integer` | The maximum number of attendees to include in the response. If there are more than the specified number of attendees, only the participant is returned. Optional. |
| `maxResults` | `integer` | Maximum number of events returned on one result page. The number of events in the resulting page may be less than this value, or none at all, even if there are more events matching the query. Incomplete pages can be detected by a non-empty `nextPageToken` field in the response. By default the value is 250 events. The page size can never be larger than 2500 events. Optional. |
| `orderBy` | `string` | The order of the events returned in the result. Optional. The default is an unspecified, stable order.   Acceptable values are:  * "`startTime`": Order by the start date/time (ascending). This is only available when querying single events (i.e. the parameter `singleEvents` is True) * "`updated`": Order by last modification time (ascending). |
| `pageToken` | `string` | Token specifying which result page to return. Optional. |
| `privateExtendedProperty` | `string` | Extended properties constraint specified as propertyName=value. Matches only private properties. This parameter might be repeated multiple times to return events that match all given constraints. |
| `q` | `string` | Free text search terms to find events that match these terms in the following fields:    * `summary` * `description` * `location` * attendee's `displayName` * attendee's `email` * organizer's `displayName` * organizer's `email` * `workingLocationProperties.officeLocation.buildingId` * `workingLocationProperties.officeLocation.deskId` * `workingLocationProperties.officeLocation.label` * `workingLocationProperties.customLocation.label`   These search terms also match predefined keywords against all display title translations of working location, out-of-office, and focus-time events. For example, searching for "Office" or "Bureau" returns working location events of type `officeLocation`, whereas searching for "Out of office" or "Abwesend" returns out-of-office events. Optional. |
| `sharedExtendedProperty` | `string` | Extended properties constraint specified as propertyName=value. Matches only shared properties. This parameter might be repeated multiple times to return events that match all given constraints. |
| `showDeleted` | `boolean` | Whether to include deleted events (with `status` equals "`cancelled`") in the result. Cancelled instances of recurring events (but not the underlying recurring event) will still be included if `showDeleted` and `singleEvents` are both False. If `showDeleted` and `singleEvents` are both True, only single instances of deleted events (but not the underlying recurring events) are returned. Optional. The default is False. |
| `showHiddenInvitations` | `boolean` | Whether to include hidden invitations in the result. Optional. The default is False. |
| `singleEvents` | `boolean` | Whether to expand recurring events into instances and only return single one-off events and instances of recurring events, but not the underlying recurring events themselves. Optional. The default is False. |
| `syncToken` | `string` | Token obtained from the `nextSyncToken` field returned on the last page of results from the previous list request. It makes the result of this list request contain only entries that have changed since then. All events deleted since the previous list request will always be in the result set and it is not allowed to set `showDeleted` to False.  There are several query parameters that cannot be specified together with `nextSyncToken` to ensure consistency of the client state.   These are:  * `iCalUID` * `orderBy` * `privateExtendedProperty` * `q` * `sharedExtendedProperty` * `timeMin` * `timeMax` * `updatedMin`  All other query parameters should be the same as for the initial synchronization to avoid undefined behavior. If the `syncToken` expires, the server will respond with a 410 GONE response code and the client should clear its storage and perform a full synchronization without any `syncToken`.  [Learn more](/workspace/calendar/api/guides/sync) about incremental synchronization.  Optional. The default is to return all entries. |
| `timeMax` | `datetime` | Upper bound (exclusive) for an event's start time to filter by. Optional. The default is not to filter by start time. Must be an RFC3339 timestamp with mandatory time zone offset, for example, 2011-06-03T10:00:00-07:00, 2011-06-03T10:00:00Z. Milliseconds may be provided but are ignored. If `timeMin` is set, `timeMax` must be greater than `timeMin`. |
| `timeMin` | `datetime` | Lower bound (exclusive) for an event's end time to filter by. Optional. The default is not to filter by end time. Must be an RFC3339 timestamp with mandatory time zone offset, for example, 2011-06-03T10:00:00-07:00, 2011-06-03T10:00:00Z. Milliseconds may be provided but are ignored. If `timeMax` is set, `timeMin` must be smaller than `timeMax`. |
| `timeZone` | `string` | Time zone used in the response. Optional. The default is the time zone of the calendar. |
| `updatedMin` | `datetime` | Lower bound for an event's last modification time (as a [RFC3339](https://tools.ietf.org/html/rfc3339) timestamp) to filter by. When specified, entries deleted since this time will always be included regardless of `showDeleted`. Optional. The default is not to filter by last modification time. |

### Authorization

This request allows authorization with at least one of the following scopes:

| Scope |
| --- |
| `https://www.googleapis.com/auth/calendar.readonly` |
| `https://www.googleapis.com/auth/calendar` |
| `https://www.googleapis.com/auth/calendar.events.readonly` |
| `https://www.googleapis.com/auth/calendar.events` |
| `https://www.googleapis.com/auth/calendar.app.created` |
| `https://www.googleapis.com/auth/calendar.events.freebusy` |
| `https://www.googleapis.com/auth/calendar.events.owned` |
| `https://www.googleapis.com/auth/calendar.events.owned.readonly` |
| `https://www.googleapis.com/auth/calendar.events.public.readonly` |

For more information, see the [authentication and authorization](/workspace/guides/configure-oauth-consent) page.

### Request body

Do not supply a request body with this method.

## Response

If successful, this method returns a response body with the following structure:

```
{
  "kind": "calendar#events",
  "etag": etag,
  "summary": string,
  "description": string,
  "updated": datetime,
  "timeZone": string,
  "accessRole": string,
  "defaultReminders": [
    {
      "method": string,
      "minutes": integer
    }
  ],
  "nextPageToken": string,
  "nextSyncToken": string,
  "items": [
    events Resource
  ]
}
```

| Property name | Value | Description | Notes |
| --- | --- | --- | --- |
| `kind` | `string` | Type of the collection ("`calendar#events`"). |  |
| `etag` | `etag` | ETag of the collection. |  |
| `summary` | `string` | Title of the calendar. Read-only. |  |
| `description` | `string` | Description of the calendar. Read-only. |  |
| `updated` | `datetime` | Last modification time of the calendar (as a [RFC3339](https://tools.ietf.org/html/rfc3339) timestamp). Read-only. |  |
| `timeZone` | `string` | The time zone of the calendar. Read-only. |  |
| `accessRole` | `string` | The user's access role for this calendar. Read-only. Possible values are:  * "`none`" - The user has no access. * "`freeBusyReader`" - The user has read access to free/busy information. * "`reader`" - The user has read access to the calendar. Private events will appear to users with reader access, but event details will be hidden. * "`writer`" - The user has read and write access to the calendar. Private events will appear to users with writer access, and event details will be visible. * "`owner`" - The user has manager access to the calendar. This role has all of the permissions of the writer role with the additional ability to see and modify access levels of other users.  Important: the `owner` role is different from the calendar's data owner. A calendar has a single data owner, but can have multiple users with `owner` role. |  |
| `defaultReminders[]` | `list` | The default reminders on the calendar for the authenticated user. These reminders apply to all events on this calendar that do not explicitly override them (i.e. do not have `reminders.useDefault` set to True). |  |
| `defaultReminders[].method` | `string` | The method used by this reminder. Possible values are:  * "`email`" - Reminders are sent via email. * "`popup`" - Reminders are sent via a UI popup.   Required when adding a reminder. | writable |
| `defaultReminders[].minutes` | `integer` | Number of minutes before the start of the event when the reminder should trigger. Valid values are between 0 and 40320 (4 weeks in minutes). Required when adding a reminder. | writable |
| `nextPageToken` | `string` | Token used to access the next page of this result. Omitted if no further results are available, in which case `nextSyncToken` is provided. |  |
| `items[]` | `list` | List of events on the calendar. |  |
| `nextSyncToken` | `string` | Token used at a later point in time to retrieve only the entries that have changed since this result was returned. Omitted if further results are available, in which case `nextPageToken` is provided. |  |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/api/v3/reference/events/delete

Send feedback

# Events: delete Stay organized with collections Save and categorize content based on your preferences.

**Note:**
Requires [authorization](#auth).

Deletes an event.
[Try it now](#try-it).

## Request

### HTTP request

```
DELETE https://www.googleapis.com/calendar/v3/calendars/calendarId/events/eventId
```

### Parameters

| Parameter name | Value | Description |
| --- | --- | --- |
| **Path parameters** | | |
| `calendarId` | `string` | Calendar identifier. To retrieve calendar IDs call the [calendarList.list](/workspace/calendar/api/v3/reference/calendarList/list) method. If you want to access the primary calendar of the currently logged in user, use the "`primary`" keyword. |
| `eventId` | `string` | Event identifier. |
| **Optional query parameters** | | |
| `sendNotifications` | `boolean` | Deprecated. Please use [sendUpdates](/workspace/calendar/api/v3/reference/events/delete#sendUpdates) instead.  Whether to send notifications about the deletion of the event. Note that some emails might still be sent even if you set the value to `false`. The default is `false`. |
| `sendUpdates` | `string` | Guests who should receive notifications about the deletion of the event.   Acceptable values are:  * "`all`": Notifications are sent to all guests. * "`externalOnly`": Notifications are sent to non-Google Calendar guests only. * "`none`": No notifications are sent. For calendar migration tasks, consider using the [Events.import](/workspace/calendar/api/v3/reference/events/import) method instead. |

### Authorization

This request requires authorization with at least one of the following scopes:

| Scope |
| --- |
| `https://www.googleapis.com/auth/calendar` |
| `https://www.googleapis.com/auth/calendar.events` |
| `https://www.googleapis.com/auth/calendar.app.created` |
| `https://www.googleapis.com/auth/calendar.events.owned` |

For more information, see the [authentication and authorization](/workspace/guides/configure-oauth-consent) page.

### Request body

Do not supply a request body with this method.

## Response

If successful, this method returns an empty response body.




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/api/concepts/events-calendars

Send feedback

# Calendars & events Stay organized with collections Save and categorize content based on your preferences.

This guide describes calendars, events, and their relationship to each other.

## Calendars

A [calendar](/workspace/calendar/v3/reference/calendars#resource-representations)
is a collection of related events, along with additional metadata
such as summary, default time zone, location, etc. Each calendar is identified
by an ID, which is an email address. Calendars can be shared with others.
Primary calendars are owned by their associated user account, other calendars are
owned by a single data owner.

## Events

An [event](/workspace/calendar/v3/reference/events#resource-representations)
is an object associated with a specific date or time range. Events are identified by a unique ID. Besides a start and
end date-time, events contain other data such as summary, description,
location, status, reminders, attachments, etc.

### Types of events

Google Calendar supports *single* and *recurring* events:

* A *single* event represents a unique occurrence.
* A *recurring* event defines multiple occurrences.

Events may also be *timed* or *all-day*:

* A *timed* event occurs between two specific points in time. Timed events
  use the `start.dateTime` and `end.dateTime` fields to specify when they
  occur.
* An *all-day* event spans an entire day or consecutive series of days. All-day
  events use the `start.date` and `end.date` fields to specify when they occur.
  Note that the timezone field has no significance for all-day events.

The start and end of the event must both be timed or both
be all-day. For example, it is **not valid** to specify
`start.date` and `end.dateTime`.

### Organizers

Events have a single *organizer* which is the calendar containing the main copy
of the event. Events can also have multiple
[attendees](/workspace/calendar/concepts/sharing#inviting_attendees_to_events).
An attendee is usually the primary calendar of an invited user.

The following diagram shows the conceptual relationship between calendars,
events, and other related elements:

## Primary calendars & other calendars

A *primary* calendar is a special type of calendar associated with a single
user account. This calendar is created automatically for each new user account
and its ID usually matches the user's primary email address. As long as the
account exists, its primary calendar can never be deleted or "un-owned" by the
user. However, it can still be shared with other users.

In addition to the primary calendar, you can explicitly create any number of
other calendars. These calendars can be modified, deleted, and shared with
others. Such calendars have a single data owner with the highest privileges,
including the exclusive right to delete the calendar. The data owner's access
level cannot be downgraded. The data owner is initially determined as the user
who created the calendar, however the data ownership can be transferred in the
Google Calendar UI.

**Important:** When creating a calendar, we
recommend that your app authenticate as the intended data owner of the calendar. You can
use [domain-wide
delegation of authority](/workspace/cloud-search/docs/guides/delegation) to allow applications to act on behalf of a specific
user. Don't use a service account for authentication. If you use a service account
for authentication, the service account is the data owner, which can lead to
unexpected behavior. For example, if a service account is the data owner, data
ownership cannot be transferred.

## Calendar & calendar list

The [Calendars](/workspace/calendar/v3/reference/calendars) collection
represents all existing calendars. It can be used to create and delete
calendars. You can also retrieve or set global properties shared across all
users with access to a calendar. For example, a calendar's title and default
time zone are global properties.

The [CalendarList](/workspace/calendar/v3/reference/calendarList) is a
collection of all calendar entries that a user has added to their list (shown
in the left panel of the web UI). You can use it to add and remove existing
calendars to/from the users’ list. You also use it to retrieve and set the
values of user-specific calendar properties, such as default reminders. Another
example is foreground color, since different users can have different colors
set for the same calendar.

**Note:** The data owner of a calendar cannot remove this calendar from their
calendar list.

The following table compares the meaning of operations for the two collections:

| Operation | Calendars | CalendarList |
| --- | --- | --- |
| `insert` | Creates a new secondary calendar. This calendar is also added to the creator's calendar list, and cannot be removed, unless the calendar is deleted or transferred. | Inserts an existing calendar into the user's list. |
| `delete` | Deletes a secondary calendar. | Removes a calendar from the user's list. |
| `get` | Retrieves calendar metadata e.g. title, time zone. | Retrieves metadata **plus** user-specific customization such as color or override reminders. |
| `patch`/`update` | Modifies calendar metadata. | Modifies user-specific calendar properties. |

## Recurring events

Some events occur multiple times on a regular schedule, such as weekly meetings,
birthdays, and holidays. Other than having different start and end times,
these repeated events are often identical.

Events are called *recurring* if they repeat according to a defined schedule.
*Single* events are non-recurring and happen only once.

### Recurrence rule

The schedule for a recurring event is defined in two parts:

* Its start and end fields (which define the first occurrence, as if this were
  just a stand-alone single event), and
* Its recurrence field (which defines how the event should be repeated over time).

The recurrence field contains an array of strings representing one or several
`RRULE`, `RDATE` or `EXDATE` properties as defined in [RFC
5545](http://tools.ietf.org/html/rfc5545).

The `RRULE` property is the most important as it defines a regular rule for
repeating the event. It is composed of several components. Some of them are:

* `FREQ` — The frequency with which the event should be repeated (such as
  `DAILY` or `WEEKLY`). Required.
* `INTERVAL` — Works together with `FREQ` to specify how often the event
  should be repeated. For example, `FREQ=DAILY;INTERVAL=2` means once every
  two days.
* `COUNT` — Number of times this event should be repeated.

  You can use either COUNT or UNTIL to specify the end
  of the event recurrence. Don't use both in the same rule.
* `UNTIL` — The date or date-time until which the event should be repeated (inclusive).
* `BYDAY` — Days of the week on which the event should be repeated (`SU`,
  `MO`, `TU`, etc.). Other similar components include `BYMONTH`, `BYYEARDAY`, and
  `BYHOUR`.

The `RDATE` property specifies additional dates or date-times when the event
occurrences should happen. For example, `RDATE;VALUE=DATE:19970101,19970120`.
Use this to add extra occurrences not covered by the `RRULE`.

The `EXDATE` property is similar to RDATE, but specifies dates or date-times
when the event should *not* happen. That is, those occurrences should be
excluded. This must point to a valid instance generated by the recurrence rule.

`EXDATE` and `RDATE` can have a time zone, and must be dates (not date-times)
for all-day events.

Each of the properties may occur within the recurrence field multiple times.
The recurrence is defined as the union of all `RRULE` and `RDATE` rules, minus the
ones excluded by all `EXDATE` rules.

Here are some examples of recurrent events:

1. An event that happens from 6am until 7am every Tuesday and Friday starting
   from September 15th, 2015 and stopping after the fifth occurrence on September 29th:

   ```
   ...
   "start": {
    "dateTime": "2015-09-15T06:00:00+02:00",
    "timeZone": "Europe/Zurich"
   },
   "end": {
    "dateTime": "2015-09-15T07:00:00+02:00",
    "timeZone": "Europe/Zurich"
   },
   "recurrence": [
    "RRULE:FREQ=WEEKLY;COUNT=5;BYDAY=TU,FR"
   ],
   …
   ```
2. An all-day event starting on June 1st, 2015 and repeating every 3 days
   throughout the month, excluding June 10th but including June 9th and 11th:

   ```
   ...
   "start": {
    "date": "2015-06-01"
   },
   "end": {
    "date": "2015-06-02"
   },
   "recurrence": [
    "EXDATE;VALUE=DATE:20150610",
    "RDATE;VALUE=DATE:20150609,20150611",
    "RRULE:FREQ=DAILY;UNTIL=20150628;INTERVAL=3"
   ],
   …
   ```

### Instances & exceptions

A recurring event consists of several *instances*: its particular occurrences
at different times. These instances act as events themselves.

Recurring event modifications can either affect the whole
recurring event (and all of its instances), or only individual instances.
Instances that differ from their parent recurring event are called *exceptions*.

For example, an exception may have a different summary, a different start time,
or additional attendees invited only to that instance. You can also cancel an
instance altogether without removing the recurring event
(instance cancellations are reflected in the event
[`status`](/workspace/calendar/v3/reference/events#status)).

Examples of how to work with recurring events and instances via the
Google Calendar API can be found [here](/workspace/calendar/recurringevents).

## Time zones

A time zone specifies a region that observes a uniform standard time.
In the Google Calendar API, you specify time zones using
[IANA time zone](http://www.iana.org/time-zones) identifiers.

You can set the time zone for both calendars and events. The following sections
describe the effects of these settings.

### Calendar time zone

The time zone of the calendar is also known as the *default time zone* because of
its implications for query results. The calendar time zone affects the way
time values are interpreted or presented by the
[`events.get()`](/workspace/calendar/v3/reference/events/get),
[`events.list()`](/workspace/calendar/v3/reference/events/list), and
[`events.instances()`](/workspace/calendar/v3/reference/events/instances) methods.

Query result time-zone conversion
:   Results of the
    [`get()`](/workspace/calendar/v3/reference/events/get),
    [`list()`](/workspace/calendar/v3/reference/events/list), and
    [`instances()`](/workspace/calendar/v3/reference/events/instances)
    methods are returned in the time zone that you specify in the `timeZone`
    parameter. If you omit this parameter, then these methods all use the calendar
    time zone as the default.

Matching all-day events to time-bracketed queries
:   The
    [`list()`](/workspace/calendar/v3/reference/events/list), and
    [`instances()`](/workspace/calendar/v3/reference/events/instances)
    methods let you specify start- and end-time filters, with the method
    returning instances that fall in the specified range. The calendar time zone
    is used to calculate start and end times of all-day events to determine
    whether they fall within the filter specification.

### Event time zone

Event instances have a start and end time; the specification for these times
may include the time zone. You can specify the time zone in several ways; the
following all specify the same time:

* Include a time zone offset in the `dateTime` field, for example `2017-01-25T09:00:00-0500`.
* Specify the time with no offset, for example `2017-01-25T09:00:00`, leaving the `timeZone` field empty (this implicitly uses the default time zone).
* Specify the time with no offset, for example `2017-01-25T09:00:00`, but use the `timeZone` field to specify the time zone.

You can also specify event times in UTC if you prefer:

* Specify the time in UTC: `2017-01-25T14:00:00Z` or use a zero offset `2017-01-25T14:00:00+0000`.

The internal representation of the event time is the same in all these cases,
but setting the `timeZone` field attaches a time zone to the event, just as
when you [set an event time zone using the Calendar
UI](https://support.google.com/calendar/answer/37064?ref_topic=6272668):

For single events, you can specify different time zones for
an event's start and end times. (This can help with events—such as travel—that
actually start and end in different time zones.) For recurring events,
see below.

### Recurring event time zone

For recurring events a single timezone must always be specified.
It is needed in order to expand the recurrences of the event.




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/api/downloads

Send feedback

# Google Workspace Calendar API: Downloads Stay organized with collections Save and categorize content based on your preferences.

In the following tables, the first column shows each library's stage of development (note that
some are in early stages), and links to documentation for the library. The second column links to
available samples for each library.

| Documentation | Samples |
| --- | --- |
| [Google API Client Library for Java](https://developers.google.com/api-client-library/java/) | [Java samples](/api-client-library/java/apis/calendar/v3) |
| [Google API Client Library for JavaScript](/api-client-library/javascript/start/start-js) | [JavaScript samples](/api-client-library/javascript/samples/samples) |
| [Google API Client Library for .NET](/api-client-library/dotnet/get_started) | [.NET samples](/api-client-library/dotnet/apis/calendar/v3) |
| [Google API Client Library for Objective-C for REST](https://github.com/google/google-api-objectivec-client-for-rest) | [Objective-C samples](https://github.com/google/google-api-objectivec-client-for-rest/tree/master/Examples) |
| [Google API Client Library for PHP ()](/api-client-library/php) | [PHP samples](https://github.com/google/google-api-php-client/tree/master/examples) |
| [Google API Client Library for Python (v1/v2)](/api-client-library/python) | [Python samples](https://github.com/google/google-api-python-client/tree/master/samples) |

These early-stage libraries are also available:

| Documentation | Samples |
| --- | --- |
| [Google APIs Client Libraries for Dart (beta)](https://pub.dartlang.org/packages/googleapis) | [Dart samples](https://github.com/dart-lang/googleapis_examples) |
| [Google API Client Library for Go](https://github.com/google/google-api-go-client) | [Go samples](https://github.com/google/google-api-go-client/tree/master/examples) |
| [Google API Client Library for Node.js (alpha)](https://github.com/google/google-api-nodejs-client/) | [Node.js samples](https://github.com/google/google-api-nodejs-client/tree/master/samples) |
| [Google API Client Library for Ruby (alpha)](/api-client-library/ruby/start/get_started) | [Ruby samples](https://github.com/google/google-api-ruby-client-samples) |

This guide provides specific setup instructions for some of these libraries. If you're working in Java, Python, PHP, .NET or Ruby, refer to [Set up a Client Library](/workspace/calendar/setup)

.




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/v3/reference/events/list

Send feedback

# Events: list Stay organized with collections Save and categorize content based on your preferences.

**Note:**
[Authorization](#auth) optional.

Returns events on the specified calendar.
[Try it now](#try-it).

## Request

### HTTP request

```
GET https://www.googleapis.com/calendar/v3/calendars/calendarId/events
```

### Parameters

| Parameter name | Value | Description |
| --- | --- | --- |
| **Path parameters** | | |
| `calendarId` | `string` | Calendar identifier. To retrieve calendar IDs call the [calendarList.list](/workspace/calendar/api/v3/reference/calendarList/list) method. If you want to access the primary calendar of the currently logged in user, use the "`primary`" keyword. |
| **Optional query parameters** | | |
| `alwaysIncludeEmail` | `boolean` | Deprecated and ignored. |
| `eventTypes` | `string` | Event types to return. Optional. This parameter can be repeated multiple times to return events of different types. If unset, returns all event types.   Acceptable values are:  * "`birthday`": Special all-day events with an annual recurrence. * "`default`": Regular events. * "`focusTime`": Focus time events. * "`fromGmail`": Events from Gmail. * "`outOfOffice`": Out of office events. * "`workingLocation`": Working location events. |
| `iCalUID` | `string` | Specifies an event ID in the iCalendar format to be provided in the response. Optional. Use this if you want to search for an event by its iCalendar ID. |
| `maxAttendees` | `integer` | The maximum number of attendees to include in the response. If there are more than the specified number of attendees, only the participant is returned. Optional. |
| `maxResults` | `integer` | Maximum number of events returned on one result page. The number of events in the resulting page may be less than this value, or none at all, even if there are more events matching the query. Incomplete pages can be detected by a non-empty `nextPageToken` field in the response. By default the value is 250 events. The page size can never be larger than 2500 events. Optional. |
| `orderBy` | `string` | The order of the events returned in the result. Optional. The default is an unspecified, stable order.   Acceptable values are:  * "`startTime`": Order by the start date/time (ascending). This is only available when querying single events (i.e. the parameter `singleEvents` is True) * "`updated`": Order by last modification time (ascending). |
| `pageToken` | `string` | Token specifying which result page to return. Optional. |
| `privateExtendedProperty` | `string` | Extended properties constraint specified as propertyName=value. Matches only private properties. This parameter might be repeated multiple times to return events that match all given constraints. |
| `q` | `string` | Free text search terms to find events that match these terms in the following fields:    * `summary` * `description` * `location` * attendee's `displayName` * attendee's `email` * organizer's `displayName` * organizer's `email` * `workingLocationProperties.officeLocation.buildingId` * `workingLocationProperties.officeLocation.deskId` * `workingLocationProperties.officeLocation.label` * `workingLocationProperties.customLocation.label`   These search terms also match predefined keywords against all display title translations of working location, out-of-office, and focus-time events. For example, searching for "Office" or "Bureau" returns working location events of type `officeLocation`, whereas searching for "Out of office" or "Abwesend" returns out-of-office events. Optional. |
| `sharedExtendedProperty` | `string` | Extended properties constraint specified as propertyName=value. Matches only shared properties. This parameter might be repeated multiple times to return events that match all given constraints. |
| `showDeleted` | `boolean` | Whether to include deleted events (with `status` equals "`cancelled`") in the result. Cancelled instances of recurring events (but not the underlying recurring event) will still be included if `showDeleted` and `singleEvents` are both False. If `showDeleted` and `singleEvents` are both True, only single instances of deleted events (but not the underlying recurring events) are returned. Optional. The default is False. |
| `showHiddenInvitations` | `boolean` | Whether to include hidden invitations in the result. Optional. The default is False. |
| `singleEvents` | `boolean` | Whether to expand recurring events into instances and only return single one-off events and instances of recurring events, but not the underlying recurring events themselves. Optional. The default is False. |
| `syncToken` | `string` | Token obtained from the `nextSyncToken` field returned on the last page of results from the previous list request. It makes the result of this list request contain only entries that have changed since then. All events deleted since the previous list request will always be in the result set and it is not allowed to set `showDeleted` to False.  There are several query parameters that cannot be specified together with `nextSyncToken` to ensure consistency of the client state.   These are:  * `iCalUID` * `orderBy` * `privateExtendedProperty` * `q` * `sharedExtendedProperty` * `timeMin` * `timeMax` * `updatedMin`  All other query parameters should be the same as for the initial synchronization to avoid undefined behavior. If the `syncToken` expires, the server will respond with a 410 GONE response code and the client should clear its storage and perform a full synchronization without any `syncToken`.  [Learn more](/workspace/calendar/api/guides/sync) about incremental synchronization.  Optional. The default is to return all entries. |
| `timeMax` | `datetime` | Upper bound (exclusive) for an event's start time to filter by. Optional. The default is not to filter by start time. Must be an RFC3339 timestamp with mandatory time zone offset, for example, 2011-06-03T10:00:00-07:00, 2011-06-03T10:00:00Z. Milliseconds may be provided but are ignored. If `timeMin` is set, `timeMax` must be greater than `timeMin`. |
| `timeMin` | `datetime` | Lower bound (exclusive) for an event's end time to filter by. Optional. The default is not to filter by end time. Must be an RFC3339 timestamp with mandatory time zone offset, for example, 2011-06-03T10:00:00-07:00, 2011-06-03T10:00:00Z. Milliseconds may be provided but are ignored. If `timeMax` is set, `timeMin` must be smaller than `timeMax`. |
| `timeZone` | `string` | Time zone used in the response. Optional. The default is the time zone of the calendar. |
| `updatedMin` | `datetime` | Lower bound for an event's last modification time (as a [RFC3339](https://tools.ietf.org/html/rfc3339) timestamp) to filter by. When specified, entries deleted since this time will always be included regardless of `showDeleted`. Optional. The default is not to filter by last modification time. |

### Authorization

This request allows authorization with at least one of the following scopes:

| Scope |
| --- |
| `https://www.googleapis.com/auth/calendar.readonly` |
| `https://www.googleapis.com/auth/calendar` |
| `https://www.googleapis.com/auth/calendar.events.readonly` |
| `https://www.googleapis.com/auth/calendar.events` |
| `https://www.googleapis.com/auth/calendar.app.created` |
| `https://www.googleapis.com/auth/calendar.events.freebusy` |
| `https://www.googleapis.com/auth/calendar.events.owned` |
| `https://www.googleapis.com/auth/calendar.events.owned.readonly` |
| `https://www.googleapis.com/auth/calendar.events.public.readonly` |

For more information, see the [authentication and authorization](/workspace/guides/configure-oauth-consent) page.

### Request body

Do not supply a request body with this method.

## Response

If successful, this method returns a response body with the following structure:

```
{
  "kind": "calendar#events",
  "etag": etag,
  "summary": string,
  "description": string,
  "updated": datetime,
  "timeZone": string,
  "accessRole": string,
  "defaultReminders": [
    {
      "method": string,
      "minutes": integer
    }
  ],
  "nextPageToken": string,
  "nextSyncToken": string,
  "items": [
    events Resource
  ]
}
```

| Property name | Value | Description | Notes |
| --- | --- | --- | --- |
| `kind` | `string` | Type of the collection ("`calendar#events`"). |  |
| `etag` | `etag` | ETag of the collection. |  |
| `summary` | `string` | Title of the calendar. Read-only. |  |
| `description` | `string` | Description of the calendar. Read-only. |  |
| `updated` | `datetime` | Last modification time of the calendar (as a [RFC3339](https://tools.ietf.org/html/rfc3339) timestamp). Read-only. |  |
| `timeZone` | `string` | The time zone of the calendar. Read-only. |  |
| `accessRole` | `string` | The user's access role for this calendar. Read-only. Possible values are:  * "`none`" - The user has no access. * "`freeBusyReader`" - The user has read access to free/busy information. * "`reader`" - The user has read access to the calendar. Private events will appear to users with reader access, but event details will be hidden. * "`writer`" - The user has read and write access to the calendar. Private events will appear to users with writer access, and event details will be visible. * "`owner`" - The user has manager access to the calendar. This role has all of the permissions of the writer role with the additional ability to see and modify access levels of other users.  Important: the `owner` role is different from the calendar's data owner. A calendar has a single data owner, but can have multiple users with `owner` role. |  |
| `defaultReminders[]` | `list` | The default reminders on the calendar for the authenticated user. These reminders apply to all events on this calendar that do not explicitly override them (i.e. do not have `reminders.useDefault` set to True). |  |
| `defaultReminders[].method` | `string` | The method used by this reminder. Possible values are:  * "`email`" - Reminders are sent via email. * "`popup`" - Reminders are sent via a UI popup.   Required when adding a reminder. | writable |
| `defaultReminders[].minutes` | `integer` | Number of minutes before the start of the event when the reminder should trigger. Valid values are between 0 and 40320 (4 weeks in minutes). Required when adding a reminder. | writable |
| `nextPageToken` | `string` | Token used to access the next page of this result. Omitted if no further results are available, in which case `nextSyncToken` is provided. |  |
| `items[]` | `list` | List of events on the calendar. |  |
| `nextSyncToken` | `string` | Token used at a later point in time to retrieve only the entries that have changed since this result was returned. Omitted if further results are available, in which case `nextPageToken` is provided. |  |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/api/v3/reference/calendarList/update

Send feedback

# CalendarList: update Stay organized with collections Save and categorize content based on your preferences.

**Note:**
Requires [authorization](#auth).

Updates an existing calendar on the user's calendar list.
[Try it now](#try-it).

## Request

### HTTP request

```
PUT https://www.googleapis.com/calendar/v3/users/me/calendarList/calendarId
```

### Parameters

| Parameter name | Value | Description |
| --- | --- | --- |
| **Path parameters** | | |
| `calendarId` | `string` | Calendar identifier. To retrieve calendar IDs call the [calendarList.list](/workspace/calendar/api/v3/reference/calendarList/list) method. If you want to access the primary calendar of the currently logged in user, use the "`primary`" keyword. |
| **Optional query parameters** | | |
| `colorRgbFormat` | `boolean` | Whether to use the `foregroundColor` and `backgroundColor` fields to write the calendar colors (RGB). If this feature is used, the index-based `colorId` field will be set to the best matching option automatically. Optional. The default is False. |

### Authorization

This request requires authorization with at least one of the following scopes:

| Scope |
| --- |
| `https://www.googleapis.com/auth/calendar` |
| `https://www.googleapis.com/auth/calendar.app.created` |
| `https://www.googleapis.com/auth/calendar.calendarlist` |

For more information, see the [authentication and authorization](/workspace/guides/configure-oauth-consent) page.

### Request body

In the request body, supply a [CalendarList resource](/workspace/calendar/api/v3/reference/calendarList#resource) with the following properties:

| Property name | Value | Description | Notes |
| --- | --- | --- | --- |
| **Optional Properties** | | | |
| `backgroundColor` | `string` | The main color of the calendar in the hexadecimal format "`#0088aa`". This property supersedes the index-based `colorId` property. To set or change this property, you need to specify `colorRgbFormat=true` in the parameters of the [insert](/calendar/v3/reference/calendarList/insert), [update](/calendar/v3/reference/calendarList/update) and [patch](/calendar/v3/reference/calendarList/patch) methods. Optional. | writable |
| `colorId` | `string` | The color of the calendar. This is an ID referring to an entry in the `calendar` section of the colors definition (see the [colors endpoint](/calendar/v3/reference/colors)). This property is superseded by the `backgroundColor` and `foregroundColor` properties and can be ignored when using these properties. Optional. | writable |
| `defaultReminders[]` | `list` | The default reminders that the authenticated user has for this calendar. | writable |
| `defaultReminders[].method` | `string` | The method used by this reminder. Possible values are:  * "`email`" - Reminders are sent via email. * "`popup`" - Reminders are sent via a UI popup.   Required when adding a reminder. | writable |
| `defaultReminders[].minutes` | `integer` | Number of minutes before the start of the event when the reminder should trigger. Valid values are between 0 and 40320 (4 weeks in minutes). Required when adding a reminder. | writable |
| `foregroundColor` | `string` | The foreground color of the calendar in the hexadecimal format "`#ffffff`". This property supersedes the index-based `colorId` property. To set or change this property, you need to specify `colorRgbFormat=true` in the parameters of the [insert](/calendar/v3/reference/calendarList/insert), [update](/calendar/v3/reference/calendarList/update) and [patch](/calendar/v3/reference/calendarList/patch) methods. Optional. | writable |
| `hidden` | `boolean` | Whether the calendar has been hidden from the list. Optional. The attribute is only returned when the calendar is hidden, in which case the value is `true`. | writable |
| `notificationSettings` | `object` | The notifications that the authenticated user is receiving for this calendar. | writable |
| `notificationSettings.notifications[].method` | `string` | The method used to deliver the notification. The possible value is:  * "`email`" - Notifications are sent via email.   Required when adding a notification. | writable |
| `notificationSettings.notifications[].type` | `string` | The type of notification. Possible values are:  * "`eventCreation`" - Notification sent when a new event is put on the calendar. * "`eventChange`" - Notification sent when an event is changed. * "`eventCancellation`" - Notification sent when an event is cancelled. * "`eventResponse`" - Notification sent when an attendee responds to the event invitation. * "`agenda`" - An agenda with the events of the day (sent out in the morning).   Required when adding a notification. | writable |
| `selected` | `boolean` | Whether the calendar content shows up in the calendar UI. Optional. The default is False. | writable |
| `summaryOverride` | `string` | The summary that the authenticated user has set for this calendar. Optional. | writable |

## Response

If successful, this method returns a [CalendarList resource](/workspace/calendar/api/v3/reference/calendarList#resource) in the response body.




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/api/v3/reference/acl/watch

Send feedback

# Acl: watch Stay organized with collections Save and categorize content based on your preferences.

**Note:**
Requires [authorization](#auth).

Watch for changes to ACL resources.

## Request

### HTTP request

```
POST https://www.googleapis.com/calendar/v3/calendars/calendarId/acl/watch
```

### Parameters

| Parameter name | Value | Description |
| --- | --- | --- |
| **Path parameters** | | |
| `calendarId` | `string` | Calendar identifier. To retrieve calendar IDs call the [calendarList.list](/workspace/calendar/api/v3/reference/calendarList/list) method. If you want to access the primary calendar of the currently logged in user, use the "`primary`" keyword. |

### Authorization

This request requires authorization with at least one of the following scopes:

| Scope |
| --- |
| `https://www.googleapis.com/auth/calendar` |
| `https://www.googleapis.com/auth/calendar.acls` |
| `https://www.googleapis.com/auth/calendar.acls.readonly` |

For more information, see the [authentication and authorization](/workspace/guides/configure-oauth-consent) page.

### Request body

In the request body, supply data with the following structure:

```
{
  "id": string,
  "token": string,
  "type": string,
  "address": string,
  "params": {
    "ttl": string
  }
}
```

| Property name | Value | Description | Notes |
| --- | --- | --- | --- |
| `id` | `string` | A UUID or similar unique string that identifies this channel. |  |
| `token` | `string` | An arbitrary string delivered to the target address with each notification delivered over this channel. Optional. |  |
| `type` | `string` | The type of delivery mechanism used for this channel. Valid values are "`web_hook`" (or "`webhook`"). Both values refer to a channel where Http requests are used to deliver messages. |  |
| `address` | `string` | The address where notifications are delivered for this channel. |  |
| `params` | `object` | Additional parameters controlling delivery channel behavior. Optional. |  |
| `params.ttl` | `string` | The time-to-live in seconds for the notification channel. Default is 604800 seconds. |  |

## Response

If successful, this method returns a response body with the following structure:

```
{
  "kind": "api#channel",
  "id": string,
  "resourceId": string,
  "resourceUri": string,
  "token": string,
  "expiration": long
}
```

| Property name | Value | Description | Notes |
| --- | --- | --- | --- |
| `kind` | `string` | Identifies this as a notification channel used to watch for changes to a resource, which is "`api#channel`". |  |
| `id` | `string` | A UUID or similar unique string that identifies this channel. |  |
| `resourceId` | `string` | An opaque ID that identifies the resource being watched on this channel. Stable across different API versions. |  |
| `resourceUri` | `string` | A version-specific identifier for the watched resource. |  |
| `token` | `string` | An arbitrary string delivered to the target address with each notification delivered over this channel. Optional. |  |
| `expiration` | `long` | Date and time of notification channel expiration, expressed as a Unix timestamp, in milliseconds. Optional. |  |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/api/v3/reference/calendars/patch

Send feedback

# Calendars: patch Stay organized with collections Save and categorize content based on your preferences.

**Note:**
Requires [authorization](#auth).

Updates metadata for a calendar. This method supports patch semantics. Note that each patch request consumes three quota units; prefer using a `get` followed by an `update`. The field values you specify replace the existing values. Fields that you don't specify in the request remain unchanged. Array fields, if specified, overwrite the existing arrays; this discards any previous array elements.
[Try it now](#try-it).

## Request

### HTTP request

```
PATCH https://www.googleapis.com/calendar/v3/calendars/calendarId
```

### Parameters

| Parameter name | Value | Description |
| --- | --- | --- |
| **Path parameters** | | |
| `calendarId` | `string` | Calendar identifier. To retrieve calendar IDs call the [calendarList.list](/workspace/calendar/api/v3/reference/calendarList/list) method. If you want to access the primary calendar of the currently logged in user, use the "`primary`" keyword. |

### Authorization

This request requires authorization with at least one of the following scopes:

| Scope |
| --- |
| `https://www.googleapis.com/auth/calendar` |
| `https://www.googleapis.com/auth/calendar.app.created` |
| `https://www.googleapis.com/auth/calendar.calendars` |

For more information, see the [authentication and authorization](/workspace/guides/configure-oauth-consent) page.

### Request body

In the request body, supply the relevant portions of a [Calendars resource](/workspace/calendar/api/v3/reference/calendars#resource), according to the rules of patch semantics.

## Response

If successful, this method returns a [Calendars resource](/workspace/calendar/api/v3/reference/calendars#resource) in the response body.




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/api/v3/reference/settings/watch

Send feedback

# Settings: watch Stay organized with collections Save and categorize content based on your preferences.

**Note:**
Requires [authorization](#auth).

Watch for changes to Settings resources.

## Request

### HTTP request

```
POST https://www.googleapis.com/calendar/v3/users/me/settings/watch
```

### Parameters

| Parameter name | Value | Description |
| --- | --- | --- |

### Authorization

This request requires authorization with at least one of the following scopes:

| Scope |
| --- |
| `https://www.googleapis.com/auth/calendar.readonly` |
| `https://www.googleapis.com/auth/calendar` |
| `https://www.googleapis.com/auth/calendar.settings.readonly` |

For more information, see the [authentication and authorization](/workspace/guides/configure-oauth-consent) page.

### Request body

In the request body, supply data with the following structure:

```
{
  "id": string,
  "token": string,
  "type": string,
  "address": string,
  "params": {
    "ttl": string
  }
}
```

| Property name | Value | Description | Notes |
| --- | --- | --- | --- |
| `id` | `string` | A UUID or similar unique string that identifies this channel. |  |
| `token` | `string` | An arbitrary string delivered to the target address with each notification delivered over this channel. Optional. |  |
| `type` | `string` | The type of delivery mechanism used for this channel. Valid values are "`web_hook`" (or "`webhook`"). Both values refer to a channel where Http requests are used to deliver messages. |  |
| `address` | `string` | The address where notifications are delivered for this channel. |  |
| `params` | `object` | Additional parameters controlling delivery channel behavior. Optional. |  |
| `params.ttl` | `string` | The time-to-live in seconds for the notification channel. Default is 604800 seconds. |  |

## Response

If successful, this method returns a response body with the following structure:

```
{
  "kind": "api#channel",
  "id": string,
  "resourceId": string,
  "resourceUri": string,
  "token": string,
  "expiration": long
}
```

| Property name | Value | Description | Notes |
| --- | --- | --- | --- |
| `kind` | `string` | Identifies this as a notification channel used to watch for changes to a resource, which is "`api#channel`". |  |
| `id` | `string` | A UUID or similar unique string that identifies this channel. |  |
| `resourceId` | `string` | An opaque ID that identifies the resource being watched on this channel. Stable across different API versions. |  |
| `resourceUri` | `string` | A version-specific identifier for the watched resource. |  |
| `token` | `string` | An arbitrary string delivered to the target address with each notification delivered over this channel. Optional. |  |
| `expiration` | `long` | Date and time of notification channel expiration, expressed as a Unix timestamp, in milliseconds. Optional. |  |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/v3/reference/events/get

Send feedback

# Events: get Stay organized with collections Save and categorize content based on your preferences.

**Note:**
[Authorization](#auth) optional.

Returns an event based on its Google Calendar ID. To retrieve an event using its iCalendar ID, call the [events.list method using the `iCalUID` parameter](/workspace/calendar/api/v3/reference/events/list#iCalUID).
[Try it now](#try-it).

## Request

### HTTP request

```
GET https://www.googleapis.com/calendar/v3/calendars/calendarId/events/eventId
```

### Parameters

| Parameter name | Value | Description |
| --- | --- | --- |
| **Path parameters** | | |
| `calendarId` | `string` | Calendar identifier. To retrieve calendar IDs call the [calendarList.list](/workspace/calendar/api/v3/reference/calendarList/list) method. If you want to access the primary calendar of the currently logged in user, use the "`primary`" keyword. |
| `eventId` | `string` | Event identifier. |
| **Optional query parameters** | | |
| `alwaysIncludeEmail` | `boolean` | Deprecated and ignored. A value will always be returned in the `email` field for the organizer, creator and attendees, even if no real email address is available (i.e. a generated, non-working value will be provided). |
| `maxAttendees` | `integer` | The maximum number of attendees to include in the response. If there are more than the specified number of attendees, only the participant is returned. Optional. |
| `timeZone` | `string` | Time zone used in the response. Optional. The default is the time zone of the calendar. |

### Authorization

This request allows authorization with at least one of the following scopes:

| Scope |
| --- |
| `https://www.googleapis.com/auth/calendar.readonly` |
| `https://www.googleapis.com/auth/calendar` |
| `https://www.googleapis.com/auth/calendar.events.readonly` |
| `https://www.googleapis.com/auth/calendar.events` |
| `https://www.googleapis.com/auth/calendar.app.created` |
| `https://www.googleapis.com/auth/calendar.events.freebusy` |
| `https://www.googleapis.com/auth/calendar.events.owned` |
| `https://www.googleapis.com/auth/calendar.events.owned.readonly` |
| `https://www.googleapis.com/auth/calendar.events.public.readonly` |

For more information, see the [authentication and authorization](/workspace/guides/configure-oauth-consent) page.

### Request body

Do not supply a request body with this method.

## Response

If successful, this method returns an [Events resource](/workspace/calendar/api/v3/reference/events#resource) in the response body.




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/api/concepts/inviting-attendees-to-events

Send feedback

# Invite users to an event Stay organized with collections Save and categorize content based on your preferences.

## Create an event

If you have write access to the organizer's Google Calendar, you can add an
event using the [`Events: insert`](/workspace/calendar/api/v3/reference/events/insert)
method.

This method adds the event directly to the organizer's calendar, independently
of their setting to add invitations.

## Add attendees

With this method, you can also add attendees to the same event by adding their
email address to the [`attendees`](/workspace/calendar/api/v3/reference/events#attendees)
property of the event. Any future changes made by the organizer to the event are
[propagated](#event-propagation) to the attendees.

Attendees receive the invitation from the organizer's email address. Google
Calendar users receive the invitation in their email and/or in their calendar,
depending on their Event settings within their Google Calendar settings:

* If they have the setting `From everyone`, the event is added directly to
  their calendar
* If they have the setting `Only if the sender is known`, the event is added
  directly to their calendar if they have previously interacted with the
  organizer, if the organizer is in the same organization, or if the organizer
  is in their [Google contacts](https://contacts.google.com). If the organizer
  isn't known to them, they can click **Add to calendar** or RSVP by
  clicking **Yes** or **Maybe** in the invitation email. Then the event is
  added to their calendar.
* If users have the setting `When I respond in email`, all invitations aren't
  added to their calendar until the user RSVPs by clicking **Yes**, **Maybe**,
  or **No** in the invitation email.

For more information about how invitations are added to Google Calendar, see
[Manage invitations in Calendar](https://support.google.com/calendar/answer/13159188).

**Important:** Prepopulating the attendee's response using the
[`attendees[].responseStatus`](/workspace/calendar/v3/reference/events#attendees.responseStatus)
property doesn't automatically add the event to the guests' calendars.
Furthermore, if more than 200 guests are invited to the event, response status
is not propagated to the guests.

## Display the event directly in attendees' calendars

To display an event directly in Google Calendar attendees' calendars for any
setting the attendee might have, you can
[set the attendee's RSVP](#set-attendees-rsvp) or
[import a copy of the event directly in the attendee's calendar](#import-copy).
For both methods, you need
[write access](/identity/protocols/oauth2/scopes#calendar) to the attendees'
calendars; if you don't, consider
[adding the organizer to the attendee's contacts](#add-organizer), which might
require write access to the attendee's contacts.

### Set the attendee's RSVP

To set an attendee's RSVP to an event, take the following steps:

1. Create the event in the Google Calendar organizer's calendar and add
   attendees ([see above](#add-attendees)).
2. Use the [`Events: update`](/workspace/calendar/api/v3/reference/events/update) method
   to set the
   [attendee's RSVP](/workspace/calendar/api/v3/reference/events#attendees.responseStatus)
   to `accepted` or `tentative`. You must have write access to the attendee's
   calendar. There might be a slight delay before the event appears on the
   attendee's calendar.
   [Learn more about how to use the `Events: update` method](/workspace/calendar/api/v3/reference/events/update).

This method adds the event to the attendee's calendar, but the attendee might
still see the banner in their email that the invitation was sent from an address
previously unknown to them.

### Import a copy of the event directly in the attendee's calendar

To import a copy of an event into an attendee's calendar, take the following
steps:

1. If you have write access to the organizer's Google Calendar, import a copy
   of the event using the
   [`Events: import`](/workspace/calendar/api/v3/reference/events/import) method.
2. Import another copy of the same event in the attendee's
   calendar using [`Events: import`](/workspace/calendar/api/v3/reference/events/import).
   You must have write access to the attendee's calendar. Use the same event ID
   ([`iCalUID`](/workspace/calendar/api/v3/reference/events/import#iCalUID)) for the
   organizer's and the attendee's copies and make sure to specify the organizer
   in the attendee's copy.

With this method, the attendee can see the event in their calendar, but doesn't
receive an invitation email from Google Calendar.

**Important:** if you don't use the same event ID, future changes to the event
made by the organizer won't be automatically propagated to the attendee.

### Add the organizer to the attendee's contacts

If you don't have the attendee's credentials, you can instruct the attendee or
their organization to add the organizer's email address to their Google contacts
in advance to display an event directly in their calendar. There might be a
slight delay for a newly created contact to take effect.

* Ask the Google Calendar user to [add the organizer to their Google contacts](https://support.google.com/contacts/answer/1069522).
* If the attendees belong to an organization, you can ask the organization's
  administrator to programmatically add email addresses to their users'
  contacts. Ask the administrator to enable
  [domain wide-delegation](https://support.google.com/a/answer/162106),
  impersonate the users and use the
  [`People: createContact`](/people/api/rest/v1/people/createContact)
  method to create contacts for each user, to ensure that future invitations
  from these email addresses automatically appear in their users' calendars.
* If you have access to the attendee's contacts, you can also add the
  organizer's email address to the attendee's contacts using the
  [`People: createContact`](/people/api/rest/v1/people/createContact) method.

## Invite user from an email address

If you don't have write access to the organizer's Google Calendar, or
if you don't want to expose the organizer's email address, use the iCalendar
protocol
([RFC-5545](https://icalendar.org/RFC-Specifications/iCalendar-RFC-5545/))
to invite users with email using an .ICS file.

If the attendee is a Google Calendar user with the setting `Only if the sender
is known`and they haven't previously interacted with or recorded the address as
known to them, the invitation isn't added to their calendar until they click
**Add to calendar** or they RSVP to the event.

**Tip:** Don't use a generic email address (for example: invitation@example.com) for
sending invitations because any abuse might impact all users that send
invitations from this address. If you can't use the organizer's email address,
we recommend using a unique and static email address for each organizer.

## Provide a link for users to add the event

Alternatively, if you want to make it easier for Google Calendar users to add an
event as a one-off without keeping it updated, you can provide a link with a
pre-filled event for the user to add themselves. This method creates a distinct
event on the user's calendar, which you can't update unless you have
access to the user's calendar.

Use the following link template:

```
https://calendar.google.com/calendar/r/eventedit?action=TEMPLATE&dates=20230325T224500Z%2F20230326T001500Z&stz=Europe/Brussels&etz=Europe/Brussels&details=EVENT_DESCRIPTION_HERE&location=EVENT_LOCATION_HERE&text=EVENT_TITLE_HERE
```

by updating the following information:

* **Start and end dates and times**: Use ISO 8601 format. In the above example,
  replace `20230325T224500Z` and `20230326T001500Z`.
* **Start and end time zones**: Format as an IANA Time Zone Database name.
  Place the time zones in the `stz` and `etz` fields.
* **Event description**: Must be URL encoded.
* **Event location**: Must be URL encoded.
* **Event title**: Must be URL encoded.

## Example

Let's consider the example of building an appointment booking service to help
users book appointments with a business. When a user books an appointment, you
want your service to add an event to the booker's and the business's Google
Calendars.

For the best user experience, we recommend that the business gives write access
to their calendar, so that you can add the event directly to the business's
calendar ([Create event](#create-event)) and invite the booker to that event
([Add attendees](#add-attendees)). To make sure the booker sees the event in
their calendar and gets reminded of it, inform them to check their emails and
RSVP **Yes** to the event immediately after making a booking. Once they RSVP to
the event, they're sent
[event notifications from Google Calendar](https://support.google.com/calendar/answer/37242)
per their notification settings.

If you want to add the event directly to the booker's calendar, inform bookers
to [add to their contacts](https://support.google.com/contacts/answer/1069522)
the email address from which they will receive the invitation. Alternatively,
ask bookers for write access to their calendar to programmatically RSVP on their
behalf ([Set the attendee's RSVP](#set-attendees-rsvp)) and send them an email
notification about the confirmed booking.

If the business doesn't want to expose their email address, use a user-specific
email address to send the event to the booker by using email
([Invite user from an email address](#invite-by-email)).

## Event propagation

The following diagram explains the dynamics. First, Jack creates an event on
his primary calendar (and thus owns the organizer copy). Then, he invites the
Cello lesson group secondary calendar and Susan, who has the event setting
`Only if the sender is known`. Attendees' copies are created on the Cello lesson
group secondary calendar, and on Susan's calendar if she knows Jack, otherwise
when she RSVPs or indicates she knows Jack. When Susan responds, the RSVP change
gets propagated back to the organizer, updating the organizer's copy with
Susan's response. These changes made to the organizer's copy of the event then
get propagated to the other attendees.

### Shared event properties

The calendar where the event is created is the *organizer calendar*. This
calendar owns the shared event information, including ID, start and end time,
summary, and description. When this information is updated on the organizer
calendar, the changes are propagated to attendee copies.

### Private event properties

Not all information is shared between all the event copies. Some properties are
private, such as reminders, `colorId`, transparency, or the
`extendedProperties.private` property. These properties are controlled by the
attendee's settings and not by the organizer calendar.

Attendees can also change the shared properties of the event. However, these
changes are only reflected on their own copy and might be lost if the organizer
makes a change.

The only event change that is propagated from attendees back to the organizer is
the attendee's response status, stored in the
[`attendees[].responseStatus`](/workspace/calendar/v3/reference/events#attendees.responseStatus)
property.




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/api/v3/reference/calendarList/insert

Send feedback

# CalendarList: insert Stay organized with collections Save and categorize content based on your preferences.

**Note:**
Requires [authorization](#auth).

Inserts an existing calendar into the user's calendar list.
[Try it now](#try-it).

## Request

### HTTP request

```
POST https://www.googleapis.com/calendar/v3/users/me/calendarList
```

### Parameters

| Parameter name | Value | Description |
| --- | --- | --- |
| **Optional query parameters** | | |
| `colorRgbFormat` | `boolean` | Whether to use the `foregroundColor` and `backgroundColor` fields to write the calendar colors (RGB). If this feature is used, the index-based `colorId` field will be set to the best matching option automatically. Optional. The default is False. |

### Authorization

This request requires authorization with at least one of the following scopes:

| Scope |
| --- |
| `https://www.googleapis.com/auth/calendar` |
| `https://www.googleapis.com/auth/calendar.calendarlist` |

For more information, see the [authentication and authorization](/workspace/guides/configure-oauth-consent) page.

### Request body

In the request body, supply a [CalendarList resource](/workspace/calendar/api/v3/reference/calendarList#resource) with the following properties:

| Property name | Value | Description | Notes |
| --- | --- | --- | --- |
| **Required Properties** | | | |
| `id` | `string` | Identifier of the calendar. |  |
| **Optional Properties** | | | |
| `backgroundColor` | `string` | The main color of the calendar in the hexadecimal format "`#0088aa`". This property supersedes the index-based `colorId` property. To set or change this property, you need to specify `colorRgbFormat=true` in the parameters of the [insert](/calendar/v3/reference/calendarList/insert), [update](/calendar/v3/reference/calendarList/update) and [patch](/calendar/v3/reference/calendarList/patch) methods. Optional. | writable |
| `colorId` | `string` | The color of the calendar. This is an ID referring to an entry in the `calendar` section of the colors definition (see the [colors endpoint](/calendar/v3/reference/colors)). This property is superseded by the `backgroundColor` and `foregroundColor` properties and can be ignored when using these properties. Optional. | writable |
| `defaultReminders[]` | `list` | The default reminders that the authenticated user has for this calendar. | writable |
| `defaultReminders[].method` | `string` | The method used by this reminder. Possible values are:  * "`email`" - Reminders are sent via email. * "`popup`" - Reminders are sent via a UI popup.   Required when adding a reminder. | writable |
| `defaultReminders[].minutes` | `integer` | Number of minutes before the start of the event when the reminder should trigger. Valid values are between 0 and 40320 (4 weeks in minutes). Required when adding a reminder. | writable |
| `foregroundColor` | `string` | The foreground color of the calendar in the hexadecimal format "`#ffffff`". This property supersedes the index-based `colorId` property. To set or change this property, you need to specify `colorRgbFormat=true` in the parameters of the [insert](/calendar/v3/reference/calendarList/insert), [update](/calendar/v3/reference/calendarList/update) and [patch](/calendar/v3/reference/calendarList/patch) methods. Optional. | writable |
| `hidden` | `boolean` | Whether the calendar has been hidden from the list. Optional. The attribute is only returned when the calendar is hidden, in which case the value is `true`. | writable |
| `notificationSettings` | `object` | The notifications that the authenticated user is receiving for this calendar. | writable |
| `notificationSettings.notifications[].method` | `string` | The method used to deliver the notification. The possible value is:  * "`email`" - Notifications are sent via email.   Required when adding a notification. | writable |
| `notificationSettings.notifications[].type` | `string` | The type of notification. Possible values are:  * "`eventCreation`" - Notification sent when a new event is put on the calendar. * "`eventChange`" - Notification sent when an event is changed. * "`eventCancellation`" - Notification sent when an event is cancelled. * "`eventResponse`" - Notification sent when an attendee responds to the event invitation. * "`agenda`" - An agenda with the events of the day (sent out in the morning).   Required when adding a notification. | writable |
| `selected` | `boolean` | Whether the calendar content shows up in the calendar UI. Optional. The default is False. | writable |
| `summaryOverride` | `string` | The summary that the authenticated user has set for this calendar. Optional. | writable |

## Response

If successful, this method returns a [CalendarList resource](/workspace/calendar/api/v3/reference/calendarList#resource) in the response body.




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/api/v3/reference/events/patch

Send feedback

# Events: patch Stay organized with collections Save and categorize content based on your preferences.

**Note:**
Requires [authorization](#auth).

Updates an event. This method supports patch semantics. Note that each patch request consumes three quota units; prefer using a `get` followed by an `update`. The field values you specify replace the existing values. Fields that you don't specify in the request remain unchanged. Array fields, if specified, overwrite the existing arrays; this discards any previous array elements.
[Try it now](#try-it).

## Request

### HTTP request

```
PATCH https://www.googleapis.com/calendar/v3/calendars/calendarId/events/eventId
```

### Parameters

| Parameter name | Value | Description |
| --- | --- | --- |
| **Path parameters** | | |
| `calendarId` | `string` | Calendar identifier. To retrieve calendar IDs call the [calendarList.list](/workspace/calendar/api/v3/reference/calendarList/list) method. If you want to access the primary calendar of the currently logged in user, use the "`primary`" keyword. |
| `eventId` | `string` | Event identifier. |
| **Optional query parameters** | | |
| `alwaysIncludeEmail` | `boolean` | Deprecated and ignored. A value will always be returned in the `email` field for the organizer, creator and attendees, even if no real email address is available (i.e. a generated, non-working value will be provided). |
| `conferenceDataVersion` | `integer` | Version number of conference data supported by the API client. Version 0 assumes no conference data support and ignores conference data in the event's body. Version 1 enables support for copying of ConferenceData as well as for creating new conferences using the createRequest field of conferenceData. The default is 0. Acceptable values are `0` to `1`, inclusive. |
| `maxAttendees` | `integer` | The maximum number of attendees to include in the response. If there are more than the specified number of attendees, only the participant is returned. Optional. |
| `sendNotifications` | `boolean` | Deprecated. Please use [sendUpdates](/workspace/calendar/api/v3/reference/events/update#sendUpdates) instead.  Whether to send notifications about the event update (for example, description changes, etc.). Note that some emails might still be sent even if you set the value to `false`. The default is `false`. |
| `sendUpdates` | `string` | Guests who should receive notifications about the event update (for example, title changes, etc.).   Acceptable values are:  * "`all`": Notifications are sent to all guests. * "`externalOnly`": Notifications are sent to non-Google Calendar guests only. * "`none`": No notifications are sent. For calendar migration tasks, consider using the [Events.import](/workspace/calendar/api/v3/reference/events/import) method instead. |
| `supportsAttachments` | `boolean` | Whether API client performing operation supports event attachments. Optional. The default is False. |

### Authorization

This request requires authorization with at least one of the following scopes:

| Scope |
| --- |
| `https://www.googleapis.com/auth/calendar` |
| `https://www.googleapis.com/auth/calendar.events` |
| `https://www.googleapis.com/auth/calendar.app.created` |
| `https://www.googleapis.com/auth/calendar.events.owned` |

For more information, see the [authentication and authorization](/workspace/guides/configure-oauth-consent) page.

### Request body

In the request body, supply the relevant portions of an [Events resource](/workspace/calendar/api/v3/reference/events#resource), according to the rules of patch semantics.

## Response

If successful, this method returns an [Events resource](/workspace/calendar/api/v3/reference/events#resource) in the response body.




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/api/v3/reference/calendars/delete

Send feedback

# Calendars: delete Stay organized with collections Save and categorize content based on your preferences.

**Note:**
Requires [authorization](#auth).

Deletes a secondary calendar. Use calendars.clear for clearing all events on primary calendars.
[Try it now](#try-it).

## Request

### HTTP request

```
DELETE https://www.googleapis.com/calendar/v3/calendars/calendarId
```

### Parameters

| Parameter name | Value | Description |
| --- | --- | --- |
| **Path parameters** | | |
| `calendarId` | `string` | Calendar identifier. To retrieve calendar IDs call the [calendarList.list](/workspace/calendar/api/v3/reference/calendarList/list) method. If you want to access the primary calendar of the currently logged in user, use the "`primary`" keyword. |

### Authorization

This request requires authorization with at least one of the following scopes:

| Scope |
| --- |
| `https://www.googleapis.com/auth/calendar` |
| `https://www.googleapis.com/auth/calendar.app.created` |
| `https://www.googleapis.com/auth/calendar.calendars` |

For more information, see the [authentication and authorization](/workspace/guides/configure-oauth-consent) page.

### Request body

Do not supply a request body with this method.

## Response

If successful, this method returns an empty response body.




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/v3/reference/settings

Send feedback

# Settings Stay organized with collections Save and categorize content based on your preferences.

Setting resources represent settings that users can change from the Calendar UI, such as the user's time zone. They can be retrieved via [list](/workspace/calendar/api/v3/reference/settings/list) and [get](/workspace/calendar/api/v3/reference/settings/get) methods. Note that if a setting has its default value, it might not be returned.  
  
The list of supported settings:

| Setting id | Description | Allowed values | Default value |
| --- | --- | --- | --- |
| autoAddHangouts | Whether to automatically add video conferences (Meet or add-on) to all events. Note this setting is ignored by the server if the conferenceDataVersion is larger than 0 as it is the client’s responsibility to handle the logic according to this setting. Read only. | “true”, “false” | “false” |
| dateFieldOrder | What should the order of day (D), month (M) and year (Y) be when displaying dates. | ”MDY”, “DMY”, “YMD” | ”MDY” |
| defaultEventLength | The default length of events (in minutes) that were created without an explicit duration. | positive number | “60” |
| format24HourTime | Whether to show the time in 24 hour format. | “true”, “false” | “false” |
| hideInvitations | Whether to hide events to which the user is invited but hasn’t acted on (for example by responding). | “true”, “false” | “false” |
| hideWeekends | Whether the weekends should be hidden when displaying a week. | “true”, “false” | “false” |
| locale | User’s locale. | "in", "ca","cs", "da", "de", "en\_GB", "en", "es", "es\_419", "tl", "fr", "hr", "it", "lv", "lt", "hu", "nl", "no", "pl", "pt\_BR", "pt\_PT", "ro", "sk", "sl", "fi", "sv", "tr", "vi", "el", "ru", "sr", "uk", "bg", "iw", "ar", "fa", "hi", "th", "zh\_TW", "zh\_CN", "ja", "ko" | “en” |
| remindOnRespondedEventsOnly | Whether event reminders should be sent only for events with the user’s response status “Yes” and “Maybe”. | “true”, “false” | “false” |
| showDeclinedEvents | Whether events to which the user responded “No” should be shown on the user’s calendar. | “true”, “false” | “true” |
| timezone | The ID of the user’s timezone. | See <http://www.iana.org/time-zones> | “Etc/GMT” |
| useKeyboardShortcuts | Whether the keyboard shortcuts are enabled. | “true”, “false” | “true” |
| weekStart | Whether the week should start on Sunday (0), Monday (1) or Saturday (6). | "0", "1", "6" | “0” |

For a list of [methods](#methods) for this resource, see the end of this page.

## Resource representations

```
{
  "kind": "calendar#setting",
  "etag": etag,
  "id": string,
  "value": string
}
```

| Property name | Value | Description | Notes |
| --- | --- | --- | --- |
| `etag` | `etag` | ETag of the resource. |  |
| `id` | `string` | The id of the user setting. |  |
| `kind` | `string` | Type of the resource ("`calendar#setting`"). |  |
| `value` | `string` | Value of the user setting. The format of the value depends on the ID of the setting. It must always be a UTF-8 string of length up to 1024 characters. |  |

## Methods

[get](/workspace/calendar/api/v3/reference/settings/get)
:   Returns a single user setting.

[list](/workspace/calendar/api/v3/reference/settings/list)
:   Returns all user settings for the authenticated user.

[watch](/workspace/calendar/api/v3/reference/settings/watch)
:   Watch for changes to Settings resources.




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query

Send feedback

# Freebusy: query Stay organized with collections Save and categorize content based on your preferences.

**Note:**
[Authorization](#auth) optional.

Returns free/busy information for a set of calendars.
[Try it now](#try-it).

## Request

### HTTP request

```
POST https://www.googleapis.com/calendar/v3/freeBusy
```

### Authorization

This request allows authorization with at least one of the following scopes:

| Scope |
| --- |
| `https://www.googleapis.com/auth/calendar.readonly` |
| `https://www.googleapis.com/auth/calendar` |
| `https://www.googleapis.com/auth/calendar.events.freebusy` |
| `https://www.googleapis.com/auth/calendar.freebusy` |

For more information, see the [authentication and authorization](/workspace/guides/configure-oauth-consent) page.

### Request body

In the request body, supply data with the following structure:

```
{
  "timeMin": datetime,
  "timeMax": datetime,
  "timeZone": string,
  "groupExpansionMax": integer,
  "calendarExpansionMax": integer,
  "items": [
    {
      "id": string
    }
  ]
}
```

| Property name | Value | Description | Notes |
| --- | --- | --- | --- |
| `timeMin` | `datetime` | The start of the interval for the query formatted as per [RFC3339](https://tools.ietf.org/html/rfc3339). |  |
| `timeMax` | `datetime` | The end of the interval for the query formatted as per [RFC3339](https://tools.ietf.org/html/rfc3339). |  |
| `timeZone` | `string` | Time zone used in the response. Optional. The default is UTC. |  |
| `groupExpansionMax` | `integer` | Maximal number of calendar identifiers to be provided for a single group. Optional. An error is returned for a group with more members than this value. Maximum value is 100. |  |
| `calendarExpansionMax` | `integer` | Maximal number of calendars for which FreeBusy information is to be provided. Optional. Maximum value is 50. |  |
| `items[]` | `list` | List of calendars and/or groups to query. |  |
| `items[].id` | `string` | The identifier of a calendar or a group. |  |

## Response

If successful, this method returns a response body with the following structure:

```
{
  "kind": "calendar#freeBusy",
  "timeMin": datetime,
  "timeMax": datetime,
  "groups": {
    (key): {
      "errors": [
        {
          "domain": string,
          "reason": string
        }
      ],
      "calendars": [
        string
      ]
    }
  },
  "calendars": {
    (key): {
      "errors": [
        {
          "domain": string,
          "reason": string
        }
      ],
      "busy": [
        {
          "start": datetime,
          "end": datetime
        }
      ]
    }
  }
}
```

| Property name | Value | Description | Notes |
| --- | --- | --- | --- |
| `kind` | `string` | Type of the resource ("calendar#freeBusy"). |  |
| `timeMin` | `datetime` | The start of the interval. |  |
| `timeMax` | `datetime` | The end of the interval. |  |
| `groups` | `object` | Expansion of groups. |  |
| `groups.(key)` | `nested object` | List of calendars that are members of this group. |  |
| `groups.(key).errors[]` | `list` | Optional error(s) (if computation for the group failed). |  |
| `groups.(key).errors[].domain` | `string` | Domain, or broad category, of the error. |  |
| `groups.(key).errors[].reason` | `string` | Specific reason for the error. Some of the possible values are:  * "`groupTooBig`" - The group of users requested is too large for a single query. * "`tooManyCalendarsRequested`" - The number of calendars requested is too large for a single query. * "`notFound`" - The requested resource was not found. * "`internalError`" - The API service has encountered an internal error.  Additional error types may be added in the future, so clients should gracefully handle additional error statuses not included in this list. |  |
| `groups.(key).calendars[]` | `list` | List of calendars' identifiers within a group. |  |
| `calendars` | `object` | List of free/busy information for calendars. |  |
| `calendars.(key)` | `nested object` | Free/busy expansions for a single calendar. |  |
| `calendars.(key).errors[]` | `list` | Optional error(s) (if computation for the calendar failed). |  |
| `calendars.(key).errors[].domain` | `string` | Domain, or broad category, of the error. |  |
| `calendars.(key).errors[].reason` | `string` | Specific reason for the error. Some of the possible values are:  * "`groupTooBig`" - The group of users requested is too large for a single query. * "`tooManyCalendarsRequested`" - The number of calendars requested is too large for a single query. * "`notFound`" - The requested resource was not found. * "`internalError`" - The API service has encountered an internal error.  Additional error types may be added in the future, so clients should gracefully handle additional error statuses not included in this list. |  |
| `calendars.(key).busy[]` | `list` | List of time ranges during which this calendar should be regarded as busy. |  |
| `calendars.(key).busy[].start` | `datetime` | The (inclusive) start of the time period. |  |
| `calendars.(key).busy[].end` | `datetime` | The (exclusive) end of the time period. |  |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/api/troubleshoot-authentication-authorization

Send feedback

# Troubleshoot authentication & authorization issues Stay organized with collections Save and categorize content based on your preferences.

This page describes some common issues that you might encounter involving
authentication and authorization.

## `This app isn't verified`

If the OAuth consent screen displays the warning "This app isn't verified," your
app is requesting scopes that provide access to sensitive user data. If your
application uses sensitive scopes, your app must go through the
[verification process](https://support.google.com/cloud/answer/7454865)
to remove that warning and other limitations. During the development phase, you
can continue past this warning by selecting **Advanced > Go to {Project Name}
(unsafe)**.

## `File not found error for credentials.json`

When running the code sample, you might receive a "file not found" or "no such
file" error message regarding credentials.json.

This error occurs when you have not authorized the desktop application
credentials. To learn how to create credentials
for a desktop application, go to
[Create credentials](/workspace/guides/create-credentials#desktop-app).

After you create the credentials, make sure the downloaded JSON file is saved as
`credentials.json`. Then move the file to your working directory.

## `Token has been expired or revoked`

When running the code sample, you might receive a "Token has been expired" or
"Token has been revoked" error message.

This error occurs when an access token from the Google Authorization Server has
either expired or has been revoked. For information about potential causes
and fixes, see
[Refresh token expiration](/identity/protocols/oauth2#expiration).

## JavaScript errors

The following are some common JavaScript errors.

### `Error: origin_mismatch`

This error occurs during the authorization flow if the host and port used
to serve the web page doesn't match an allowed JavaScript origin on your
Google Cloud console project. Make sure you set an authorized
JavaScript origin and that the URL in your browser matches the origin URL.

### `idpiframe_initialization_failed: Failed to read the 'localStorage' property from 'Window'`

This error occurs when third-party cookies and data storage aren't enabled
in your browser. These options are required by the Google Sign-in library. For
more information, see
[3rd-party cookies and data storage](https://developers.google.com/identity/sign-in/web/troubleshooting#third-party_cookies_and_data_blocked).

**Note:** In your own app, you should prompt users to enable third-party cookies and
data storage or add an exception for `accounts.google.com`.

### `idpiframe_initialization_failed: Not a valid origin for the client`

This error occurs when the domain registered doesn't match the domain being
used to host the web page. Ensure that the origin you registered matches the URL
in the browser.




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/api/v3/reference/freebusy

Send feedback

# Freebusy Stay organized with collections Save and categorize content based on your preferences.

For a list of [methods](#methods) for this resource, see the end of this page.

## Resource representations

There is no persistent data associated with this resource.

## Methods

[query](/workspace/calendar/api/v3/reference/freebusy/query)
:   Returns free/busy information for a set of calendars.




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/api/v3/reference/acl/delete

Send feedback

# Acl: delete Stay organized with collections Save and categorize content based on your preferences.

**Note:**
Requires [authorization](#auth).

Deletes an access control rule.
[Try it now](#try-it).

## Request

### HTTP request

```
DELETE https://www.googleapis.com/calendar/v3/calendars/calendarId/acl/ruleId
```

### Parameters

| Parameter name | Value | Description |
| --- | --- | --- |
| **Path parameters** | | |
| `calendarId` | `string` | Calendar identifier. To retrieve calendar IDs call the [calendarList.list](/workspace/calendar/api/v3/reference/calendarList/list) method. If you want to access the primary calendar of the currently logged in user, use the "`primary`" keyword. |
| `ruleId` | `string` | ACL rule identifier. |

### Authorization

This request requires authorization with at least one of the following scopes:

| Scope |
| --- |
| `https://www.googleapis.com/auth/calendar` |
| `https://www.googleapis.com/auth/calendar.acls` |

For more information, see the [authentication and authorization](/workspace/guides/configure-oauth-consent) page.

### Request body

Do not supply a request body with this method.

## Response

If successful, this method returns an empty response body.




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/api/support

Send feedback

# How to get help Stay organized with collections Save and categorize content based on your preferences.

We use a mixture of different platforms to provide support to developers, so
review the options below to determine the best way to get help.

**Note:** These channels should only be used for *developer* issues. Feedback
about the core product should be submitted via the **Feedback** or
**Report a problem** links in the product user interface.

## Questions & advice

### Community Forums (Official)

Join the conversation about Google Workspace development in the
[Google Workspace Developers](https://discuss.google.dev/c/google-workspace/20)
community forum.

### Reddit (Unofficial)

You can also find help in community-run subreddits:

* [r/GoogleAppsScript](https://www.reddit.com/r/GoogleAppsScript/)
* [r/googleworkspacedevs](https://www.reddit.com/r/googleworkspacedevs/)

### Stack Overflow

We also use the popular programming Q&A website
[Stack Overflow](https://stackoverflow.com/questions/tagged/google-calendar-api)
to field technical questions. Google doesn't own or manage this site, but you
can sign in with your Google Account.

Stack Overflow contains questions on a variety of topics, and developers use the
tag `[google-calendar-api]` to mark questions relevant to
this service. You might want to add additional tags to your question to attract
the attention of experts in related technologies.

Search existing questions
[Ask a new question](https://stackoverflow.com/questions/ask?tags=google-calendar-api,google-workspace)

## Developer product feedback

If you have feedback about developer product features or functionality,
[search our Issue Tracker](https://issuetracker.google.com/issues?q=status:open%20componentid:191627%2B%20type:(bug%7Cfeature_request%7Ccustomer_issue))
to see if others have already submitted the same feedback. If you find an
existing feedback report, click the star next to the issue number to express
your agreement and help us prioritize the most important reports. If you have
additional context or information to contribute, you can add a comment.

If no one else has submitted similar feedback, you can submit a new feedback
report. Please describe your feedback as specifically as possible, including
why you think it's important.

Search existing feedback
[Submit bug](https://issuetracker.google.com/issues/new?component=191627&template=824103)
[Submit feature request](https://issuetracker.google.com/issues/new?component=191627&template=823906)

## Contact Google Workspace support

Google Workspace administrators can
[email a Google Workspace developer support specialist](https://support.google.com/a/answer/6103110)

Make sure you include the following information when you contact us:

* A description of the problem, and the behavior you expected instead.
* A list of steps and a small snippet of sample code that can be used to
  reproduce the problem.
* A description of the output you expect and what actually occurred. Include any
  error messages you receive.
* Information about your development environment, including programming
  language, library versions, etc.




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/api/v3/reference/calendarList/patch

Send feedback

# CalendarList: patch Stay organized with collections Save and categorize content based on your preferences.

**Note:**
Requires [authorization](#auth).

Updates an existing calendar on the user's calendar list. This method supports patch semantics. Note that each patch request consumes three quota units; prefer using a `get` followed by an `update`. The field values you specify replace the existing values. Fields that you don't specify in the request remain unchanged. Array fields, if specified, overwrite the existing arrays; this discards any previous array elements.
[Try it now](#try-it).

## Request

### HTTP request

```
PATCH https://www.googleapis.com/calendar/v3/users/me/calendarList/calendarId
```

### Parameters

| Parameter name | Value | Description |
| --- | --- | --- |
| **Path parameters** | | |
| `calendarId` | `string` | Calendar identifier. To retrieve calendar IDs call the [calendarList.list](/workspace/calendar/api/v3/reference/calendarList/list) method. If you want to access the primary calendar of the currently logged in user, use the "`primary`" keyword. |
| **Optional query parameters** | | |
| `colorRgbFormat` | `boolean` | Whether to use the `foregroundColor` and `backgroundColor` fields to write the calendar colors (RGB). If this feature is used, the index-based `colorId` field will be set to the best matching option automatically. Optional. The default is False. |

### Authorization

This request requires authorization with at least one of the following scopes:

| Scope |
| --- |
| `https://www.googleapis.com/auth/calendar` |
| `https://www.googleapis.com/auth/calendar.app.created` |
| `https://www.googleapis.com/auth/calendar.calendarlist` |

For more information, see the [authentication and authorization](/workspace/guides/configure-oauth-consent) page.

### Request body

In the request body, supply the relevant portions of a [CalendarList resource](/workspace/calendar/api/v3/reference/calendarList#resource), according to the rules of patch semantics.

## Response

If successful, this method returns a [CalendarList resource](/workspace/calendar/api/v3/reference/calendarList#resource) in the response body.




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/api/v3/reference/calendars

Send feedback

# Calendars Stay organized with collections Save and categorize content based on your preferences.

A collection of all existing calendars. See also [Calendars vs CalendarList](/workspace/calendar/api/concepts/events-calendars#calendar_and_calendar_list).

For a list of [methods](#methods) for this resource, see the end of this page.

## Resource representations

```
{
  "kind": "calendar#calendar",
  "etag": etag,
  "id": string,
  "summary": string,
  "description": string,
  "location": string,
  "timeZone": string,
  "dataOwner": string,
  "conferenceProperties": {
    "allowedConferenceSolutionTypes": [
      string
    ]
  },
  "autoAcceptInvitations": boolean
}
```

| Property name | Value | Description | Notes |
| --- | --- | --- | --- |
| `autoAcceptInvitations` | `boolean` | Whether this calendar automatically accepts invitations. Only valid for resource calendars. |  |
| `conferenceProperties` | `nested object` | Conferencing properties for this calendar, for example what types of conferences are allowed. |  |
| `conferenceProperties.allowedConferenceSolutionTypes[]` | `list` | The types of conference solutions that are supported for this calendar. The possible values are:   * `"eventHangout"` * `"eventNamedHangout"` * `"hangoutsMeet"`  Optional. |  |
| `dataOwner` | `string` | The email of the owner of the calendar. Set only for secondary calendars. Read-only. |  |
| `description` | `string` | Description of the calendar. Optional. | writable |
| `etag` | `etag` | ETag of the resource. |  |
| `id` | `string` | Identifier of the calendar. To retrieve IDs call the [calendarList.list()](/calendar/v3/reference/calendarList/list) method. |  |
| `kind` | `string` | Type of the resource ("`calendar#calendar`"). |  |
| `location` | `string` | Geographic location of the calendar as free-form text. Optional. | writable |
| `summary` | `string` | Title of the calendar. | writable |
| `timeZone` | `string` | The time zone of the calendar. (Formatted as an IANA Time Zone Database name, e.g. "Europe/Zurich".) Optional. | writable |

## Methods

[clear](/workspace/calendar/api/v3/reference/calendars/clear)
:   Clears a primary calendar. This operation deletes all events associated with the primary calendar of an account.

[delete](/workspace/calendar/api/v3/reference/calendars/delete)
:   Deletes a secondary calendar. Use calendars.clear for clearing all events on primary calendars.

[get](/workspace/calendar/api/v3/reference/calendars/get)
:   Returns metadata for a calendar.

[insert](/workspace/calendar/api/v3/reference/calendars/insert)
:   Creates a secondary calendar.

    The authenticated user for the request is made the data owner of the new calendar.

    **Note:** We recommend to authenticate as the intended data owner of the calendar. You can use [domain-wide delegation of authority](/workspace/cloud-search/docs/guides/delegation) to allow applications to act on behalf of a specific user. Don't use a service account for authentication. If you use a service account for authentication, the service account is the data owner, which can lead to unexpected behavior. For example, if a service account is the data owner, data ownership cannot be transferred.

[patch](/workspace/calendar/api/v3/reference/calendars/patch)
:   Updates metadata for a calendar. This method supports patch semantics. Note that each patch request consumes three quota units; prefer using a `get` followed by an `update`. The field values you specify replace the existing values. Fields that you don't specify in the request remain unchanged. Array fields, if specified, overwrite the existing arrays; this discards any previous array elements.

[update](/workspace/calendar/api/v3/reference/calendars/update)
:   Updates metadata for a calendar.




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/api/v3/reference/colors

Send feedback

# Colors Stay organized with collections Save and categorize content based on your preferences.

For a list of [methods](#methods) for this resource, see the end of this page.

## Resource representations

```
{
  "kind": "calendar#colors",
  "updated": datetime,
  "calendar": {
    (key): {
      "background": string,
      "foreground": string
    }
  },
  "event": {
    (key): {
      "background": string,
      "foreground": string
    }
  }
}
```

| Property name | Value | Description | Notes |
| --- | --- | --- | --- |
| `calendar` | `object` | A global palette of calendar colors, mapping from the color ID to its definition. A `calendarListEntry` resource refers to one of these color IDs in its `colorId` field. Read-only. |  |
| `calendar.(key)` | `nested object` | A calendar color definition. |  |
| `calendar.(key).background` | `string` | The background color associated with this color definition. |  |
| `calendar.(key).foreground` | `string` | The foreground color that can be used to write on top of a background with 'background' color. |  |
| `event` | `object` | A global palette of event colors, mapping from the color ID to its definition. An `event` resource may refer to one of these color IDs in its `colorId` field. Read-only. |  |
| `event.(key)` | `nested object` | An event color definition. |  |
| `event.(key).background` | `string` | The background color associated with this color definition. |  |
| `event.(key).foreground` | `string` | The foreground color that can be used to write on top of a background with 'background' color. |  |
| `kind` | `string` | Type of the resource ("`calendar#colors`"). |  |
| `updated` | `datetime` | Last modification time of the color palette (as a [RFC3339](https://tools.ietf.org/html/rfc3339) timestamp). Read-only. |  |

## Methods

[get](/workspace/calendar/api/v3/reference/colors/get)
:   Returns the color definitions for calendars and events.




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/recurringevents

Send feedback

# Recurring events Stay organized with collections Save and categorize content based on your preferences.

This document describes how to work with [recurring events](/workspace/calendar/concepts/events-calendars#recurring_events) and their instances.

## Create recurring events

Creating recurring events is similar to [creating](/workspace/calendar/v3/reference/events/insert) a regular (single) event with the [`event`](/workspace/calendar/v3/reference/events) resource's [`recurrence`](/workspace/calendar/v3/reference/events#recurrence) field set.

[Protocol](#protocol)[Java](#java)[.NET](#.net)[Python](#python)
More

[PHP](#php)[Ruby](#ruby)

```
POST /calendar/v3/calendars/primary/events
...

{
  "summary": "Appointment",
  "location": "Somewhere",
  "start": {
    "dateTime": "2011-06-03T10:00:00.000-07:00",
    "timeZone": "America/Los_Angeles"
  },
  "end": {
    "dateTime": "2011-06-03T10:25:00.000-07:00",
    "timeZone": "America/Los_Angeles"
  },
  "recurrence": [
    "RRULE:FREQ=WEEKLY;UNTIL=20110701T170000Z",
  ],
  "attendees": [
    {
      "email": "attendeeEmail",
      # Other attendee's data...
    },
    # ...
  ],
}
```

```
Event event = new Event();

event.setSummary("Appointment");
event.setLocation("Somewhere");

ArrayList<EventAttendee> attendees = new ArrayList<EventAttendee>();
attendees.add(new EventAttendee().setEmail("attendeeEmail"));
// ...
event.setAttendees(attendees);

DateTime start = DateTime.parseRfc3339("2011-06-03T10:00:00.000-07:00");
DateTime end = DateTime.parseRfc3339("2011-06-03T10:25:00.000-07:00");
event.setStart(new EventDateTime().setDateTime(start).setTimeZone("America/Los_Angeles"));
event.setEnd(new EventDateTime().setDateTime(end).setTimeZone("America/Los_Angeles"));
event.setRecurrence(Arrays.asList("RRULE:FREQ=WEEKLY;UNTIL=20110701T170000Z"));

Event recurringEvent = service.events().insert("primary", event).execute();

System.out.println(createdEvent.getId());
```

```
Event event = new Event()
    {
      Summary = "Appointment",
      Location = "Somewhere",
      Start = new EventDateTime() {
          DateTime = new DateTime("2011-06-03T10:00:00.000:-07:00")
          TimeZone = "America/Los_Angeles"
      },
      End = new EventDateTime() {
          DateTime = new DateTime("2011-06-03T10:25:00.000:-07:00")
          TimeZone = "America/Los_Angeles"
      },
      Recurrence = new String[] {
          "RRULE:FREQ=WEEKLY;UNTIL=20110701T170000Z"
      },
      Attendees = new List<EventAttendee>()
          {
            new EventAttendee() { Email: "attendeeEmail" },
            // ...
          }
    };

Event recurringEvent = service.Events.Insert(event, "primary").Fetch();

Console.WriteLine(recurringEvent.Id);
```

```
event = {
  'summary': 'Appointment',
  'location': 'Somewhere',
  'start': {
    'dateTime': '2011-06-03T10:00:00.000-07:00',
    'timeZone': 'America/Los_Angeles'
  },
  'end': {
    'dateTime': '2011-06-03T10:25:00.000-07:00',
    'timeZone': 'America/Los_Angeles'
  },
  'recurrence': [
    'RRULE:FREQ=WEEKLY;UNTIL=20110701T170000Z',
  ],
  'attendees': [
    {
      'email': 'attendeeEmail',
      # Other attendee's data...
    },
    # ...
  ],
}

recurring_event = service.events().insert(calendarId='primary', body=event).execute()

print recurring_event['id']
```

```
$event = new Google_Service_Calendar_Event();
$event->setSummary('Appointment');
$event->setLocation('Somewhere');
$start = new Google_Service_Calendar_EventDateTime();
$start->setDateTime('2011-06-03T10:00:00.000-07:00');
$start->setTimeZone('America/Los_Angeles');
$event->setStart($start);
$end = new Google_Service_Calendar_EventDateTime();
$end->setDateTime('2011-06-03T10:25:00.000-07:00');
$end->setTimeZone('America/Los_Angeles');
$event->setEnd($end);
$event->setRecurrence(array('RRULE:FREQ=WEEKLY;UNTIL=20110701T170000Z'));
$attendee1 = new Google_Service_Calendar_EventAttendee();
$attendee1->setEmail('attendeeEmail');
// ...
$attendees = array($attendee1,
                   // ...
                   );
$event->attendees = $attendees;
$recurringEvent = $service->events->insert('primary', $event);

echo $recurringEvent->getId();
```

```
event = Google::Apis::CalendarV3::Event.new(
  summary: 'Appointment',
  location: 'Somewhere',
  start: {
    date_time: '2011-06-03T10:00:00.000-07:00',
    time_zone:  'America/Los_Angeles'
  },
  end: {
    date_time: '2011-06-03T10:25:00.000-07:00',
    time_zone: 'America/Los_Angeles'
  },
  recurrence: ['RRULE:FREQ=WEEKLY;UNTIL=20110701T170000Z']
  attendees: [
    {
      email: 'attendeeEmail'
    },
    #...
  ]
)
response = client.insert_event('primary', event)
print response.id
```

## Access instances

To see all the [instances](/workspace/calendar/concepts/events-calendars#instances_and_exceptions) of a given
recurring event you can use the [events.instances()](/workspace/calendar/v3/reference/events/instances) request.

The [`events.list()`](/workspace/calendar/v3/reference/events/list) request by default
only returns single events, recurring events, and
[exceptions](/workspace/calendar/concepts/events-calendars#instances_and_exceptions);
instances that are not exceptions are not returned.
If the [`singleEvents`](/workspace/calendar/v3/reference/events/list#singleEvents) parameter
is set `true` then all individual instances appear in the result, but underlying recurring events don't. When a user who has free/busy permissions queries `events.list()`,
it behaves as if `singleEvent` is `true`. For more information about access control list rules, see [Acl](/calendar/v3/reference/acl).

**Warning:** Do not modify instances individually when you want to modify
the entire recurring event, or ["this and following"](#modifying_all_following_instances) instances.
This creates lots of exceptions that clutter the calendar, slowing down access and sending a high number
of change notifications to users.

Individual instances are similar to single events. Unlike their parent recurring events,
instances do not have the [`recurrence`](/workspace/calendar/v3/reference/events#recurrence) field set.

The following event fields are specific to instances:

* [`recurringEventId`](/workspace/calendar/v3/reference/events#recurringEventId) — the ID of the parent recurring event this instance belongs to
* [`originalStartTime`](/workspace/calendar/v3/reference/events#originalStartTime) —
  the time this instance starts according to the recurrence data in the parent recurring event.
  This can be different from the actual [`start`](/workspace/calendar/v3/reference/events#start) time if the instance was rescheduled.
  It uniquely identifies the instance within the recurring event series even if the instance was moved.

## Modify or delete instances

To modify a single instance (creating an exception), client applications must first retrieve the instance and then update it by sending an authorized PUT request to the instance edit URL with updated data in the body.
The URL is of the form:

```
https://www.googleapis.com/calendar/v3/calendars/calendarId/events/instanceId
```

Use appropriate values in place of calendarId and instanceId.

**Note:** The special calendarId value `primary` can be used to refer to the authenticated user's primary calendar.

Upon success, the server responds with an HTTP 200 OK status code with the updated instance.
The following example shows how to cancel an instance of a recurring event.

[Protocol](#protocol)[Java](#java)[.NET](#.net)[Python](#python)[PHP](#php)[Ruby](#ruby)
More

```
PUT /calendar/v3/calendars/primary/events/instanceId
...

{
  "kind": "calendar#event",
  "id": "instanceId",
  "etag": "instanceEtag",
  "status": "cancelled",
  "htmlLink": "https://www.google.com/calendar/event?eid=instanceEid",
  "created": "2011-05-23T22:27:01.000Z",
  "updated": "2011-05-23T22:27:01.000Z",
  "summary": "Recurring event",
  "location": "Somewhere",
  "creator": {
    "email": "userEmail"
  },
  "recurringEventId": "recurringEventId",
  "originalStartTime": "2011-06-03T10:00:00.000-07:00",
  "organizer": {
    "email": "userEmail",
    "displayName": "userDisplayName"
  },
  "start": {
    "dateTime": "2011-06-03T10:00:00.000-07:00",
    "timeZone": "America/Los_Angeles"
  },
  "end": {
    "dateTime": "2011-06-03T10:25:00.000-07:00",
    "timeZone": "America/Los_Angeles"
  },
  "iCalUID": "eventUID",
  "sequence": 0,
  "attendees": [
    {
      "email": "attendeeEmail",
      "displayName": "attendeeDisplayName",
      "responseStatus": "needsAction"
    },
    # ...
    {
      "email": "userEmail",
      "displayName": "userDisplayName",
      "responseStatus": "accepted",
      "organizer": true,
      "self": true
    }
  ],
  "guestsCanInviteOthers": false,
  "guestsCanSeeOtherGuests": false,
  "reminders": {
    "useDefault": true
  }
}
```

```
// First retrieve the instances from the API.
Events instances = service.events().instances("primary", "recurringEventId").execute();

// Select the instance to cancel.
Event instance = instances.getItems().get(0);
instance.setStatus("cancelled");

Event updatedInstance = service.events().update("primary", instance.getId(), instance).execute();

// Print the updated date.
System.out.println(updatedInstance.getUpdated());
```

```
// First retrieve the instances from the API.
Events instances = service.Events.Instances("primary", "recurringEventId").Fetch();

// Select the instance to cancel.
Event instance = instances.Items[0];
instance.Status = "cancelled";

Event updatedInstance = service.Events.Update(instance, "primary", instance.Id).Fetch();

// Print the updated date.
Console.WriteLine(updatedInstance.Updated);
```

```
# First retrieve the instances from the API.
instances = service.events().instances(calendarId='primary', eventId='recurringEventId').execute()

# Select the instance to cancel.
instance = instances['items'][0]
instance['status'] = 'cancelled'

updated_instance = service.events().update(calendarId='primary', eventId=instance['id'], body=instance).execute()

# Print the updated date.
print updated_instance['updated']
```

```
$events = $service->events->instances("primary", "eventId");

// Select the instance to cancel.
$instance = $events->getItems()[0];
$instance->setStatus('cancelled');

$updatedInstance = $service->events->update('primary', $instance->getId(), $instance);

// Print the updated date.
echo $updatedInstance->getUpdated();
```

```
# First retrieve the instances from the API.
instances = client.list_event_instances('primary', 'recurringEventId')

# Select the instance to cancel.
instance = instances.items[0]
instance.status = 'cancelled'

response = client.update_event('primary', instance.id, instance)
print response.updated
```

## Modify all following instances

In order to change all the instances of a recurring event on or after a given (target) instance,
you must make two separate API requests. These requests split the original recurring event into two:
the original one which retains the instances without the change and the new recurring event having
instances where the change is applied:

1. Call [`events.update()`](/workspace/calendar/v3/reference/events/update) to
   trim the original recurring event of the instances to be updated. Do this by setting the
   `UNTIL` component of the `RRULE` to point before the start time of the
   first target instance. Alternatively, you can set the`COUNT` component instead of
   `UNTIL`.
2. Call [`events.insert()`](/workspace/calendar/v3/reference/events/insert) to
   create a new recurring event with all the same data as the original, except for the
   change you are attempting to make. The new recurring event must have the start time of
   the target instance.

This example shows how to change the location to "Somewhere else", starting from the third
instance of the recurring event from the previous examples.

[Protocol](#protocol)
More

```
# Updating the original recurring event to trim the instance list:

PUT /calendar/v3/calendars/primary/events/recurringEventId
...

{
  "summary": "Appointment",
  "location": "Somewhere",
  "start": {
    "dateTime": "2011-06-03T10:00:00.000-07:00",
    "timeZone": "America/Los_Angeles"
  },
  "end": {
    "dateTime": "2011-06-03T10:25:00.000-07:00",
    "timeZone": "America/Los_Angeles"
  },
  "recurrence": [
    "RRULE:FREQ=WEEKLY;UNTIL=20110617T065959Z",
  ],
  "attendees": [
    {
      "email": "attendeeEmail",
      # Other attendee's data...
    },
    # ...
  ],
}


# Creating a new recurring event with the change applied:

POST /calendar/v3/calendars/primary/events
...

{
  "summary": "Appointment",
  "location": "Somewhere else",
  "start": {
    "dateTime": "2011-06-17T10:00:00.000-07:00",
    "timeZone": "America/Los_Angeles"
  },
  "end": {
    "dateTime": "2011-06-17T10:25:00.000-07:00",
    "timeZone": "America/Los_Angeles"
  },
  "recurrence": [
    "RRULE:FREQ=WEEKLY;UNTIL=20110617T065959Z",
  ],
  "attendees": [
    {
      "email": "attendeeEmail",
      # Other attendee's data...
    },
    # ...
  ],
}
```

**Note:** Changing all following instances resets any exceptions happening
after the target instance.




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/api/v3/reference/settings/get

Send feedback

# Settings: get Stay organized with collections Save and categorize content based on your preferences.

**Note:**
Requires [authorization](#auth).

Returns a single user setting.
[Try it now](#try-it).

## Request

### HTTP request

```
GET https://www.googleapis.com/calendar/v3/users/me/settings/setting
```

### Parameters

| Parameter name | Value | Description |
| --- | --- | --- |
| **Path parameters** | | |
| `setting` | `string` | The id of the user setting. |

### Authorization

This request requires authorization with at least one of the following scopes:

| Scope |
| --- |
| `https://www.googleapis.com/auth/calendar.readonly` |
| `https://www.googleapis.com/auth/calendar` |
| `https://www.googleapis.com/auth/calendar.settings.readonly` |

For more information, see the [authentication and authorization](/workspace/guides/configure-oauth-consent) page.

### Request body

Do not supply a request body with this method.

## Response

If successful, this method returns a [Settings resource](/workspace/calendar/api/v3/reference/settings#resource) in the response body.




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/v3/reference

Send feedback

# API Reference Stay organized with collections Save and categorize content based on your preferences.

This API reference is organized by resource type. Each resource type has one or more data representations and one or more methods.

## Resource types

1. [Acl](#Acl)
2. [CalendarList](#CalendarList)
3. [Calendars](#Calendars)
4. [Channels](#Channels)
5. [Colors](#Colors)
6. [Events](#Events)
7. [Freebusy](#Freebusy)
8. [Settings](#Settings)

## Acl

For Acl Resource details, see the [resource representation](/workspace/calendar/api/v3/reference/acl#resource) page.

| Method | HTTP request | Description |
| --- | --- | --- |
| URIs relative to https://www.googleapis.com/calendar/v3, unless otherwise noted | | |
| [delete](/workspace/calendar/api/v3/reference/acl/delete) | `DELETE  /calendars/calendarId/acl/ruleId` | Deletes an access control rule. |
| [get](/workspace/calendar/api/v3/reference/acl/get) | `GET  /calendars/calendarId/acl/ruleId` | Returns an access control rule. |
| [insert](/workspace/calendar/api/v3/reference/acl/insert) | `POST  /calendars/calendarId/acl` | Creates an access control rule. |
| [list](/workspace/calendar/api/v3/reference/acl/list) | `GET  /calendars/calendarId/acl` | Returns the rules in the access control list for the calendar. |
| [patch](/workspace/calendar/api/v3/reference/acl/patch) | `PATCH  /calendars/calendarId/acl/ruleId` | Updates an access control rule. This method supports patch semantics. Note that each patch request consumes three quota units; prefer using a `get` followed by an `update`. The field values you specify replace the existing values. Fields that you don't specify in the request remain unchanged. Array fields, if specified, overwrite the existing arrays; this discards any previous array elements. |
| [update](/workspace/calendar/api/v3/reference/acl/update) | `PUT  /calendars/calendarId/acl/ruleId` | Updates an access control rule. |
| [watch](/workspace/calendar/api/v3/reference/acl/watch) | `POST  /calendars/calendarId/acl/watch` | Watch for changes to ACL resources. |

## CalendarList

For CalendarList Resource details, see the [resource representation](/workspace/calendar/api/v3/reference/calendarList#resource) page.

| Method | HTTP request | Description |
| --- | --- | --- |
| URIs relative to https://www.googleapis.com/calendar/v3, unless otherwise noted | | |
| [delete](/workspace/calendar/api/v3/reference/calendarList/delete) | `DELETE  /users/me/calendarList/calendarId` | Removes a calendar from the user's calendar list. |
| [get](/workspace/calendar/api/v3/reference/calendarList/get) | `GET  /users/me/calendarList/calendarId` | Returns a calendar from the user's calendar list. |
| [insert](/workspace/calendar/api/v3/reference/calendarList/insert) | `POST  /users/me/calendarList` | Inserts an existing calendar into the user's calendar list. |
| [list](/workspace/calendar/api/v3/reference/calendarList/list) | `GET  /users/me/calendarList` | Returns the calendars on the user's calendar list. |
| [patch](/workspace/calendar/api/v3/reference/calendarList/patch) | `PATCH  /users/me/calendarList/calendarId` | Updates an existing calendar on the user's calendar list. This method supports patch semantics. Note that each patch request consumes three quota units; prefer using a `get` followed by an `update`. The field values you specify replace the existing values. Fields that you don't specify in the request remain unchanged. Array fields, if specified, overwrite the existing arrays; this discards any previous array elements. |
| [update](/workspace/calendar/api/v3/reference/calendarList/update) | `PUT  /users/me/calendarList/calendarId` | Updates an existing calendar on the user's calendar list. |
| [watch](/workspace/calendar/api/v3/reference/calendarList/watch) | `POST  /users/me/calendarList/watch` | Watch for changes to CalendarList resources. |

## Calendars

For Calendars Resource details, see the [resource representation](/workspace/calendar/api/v3/reference/calendars#resource) page.

| Method | HTTP request | Description |
| --- | --- | --- |
| URIs relative to https://www.googleapis.com/calendar/v3, unless otherwise noted | | |
| [clear](/workspace/calendar/api/v3/reference/calendars/clear) | `POST  /calendars/calendarId/clear` | Clears a primary calendar. This operation deletes all events associated with the primary calendar of an account. |
| [delete](/workspace/calendar/api/v3/reference/calendars/delete) | `DELETE  /calendars/calendarId` | Deletes a secondary calendar. Use calendars.clear for clearing all events on primary calendars. |
| [get](/workspace/calendar/api/v3/reference/calendars/get) | `GET  /calendars/calendarId` | Returns metadata for a calendar. |
| [insert](/workspace/calendar/api/v3/reference/calendars/insert) | `POST  /calendars` | Creates a secondary calendar. The authenticated user for the request is made the data owner of the new calendar.   **Note:** We recommend to authenticate as the intended data owner of the calendar. You can use [domain-wide delegation of authority](/workspace/cloud-search/docs/guides/delegation) to allow applications to act on behalf of a specific user. Don't use a service account for authentication. If you use a service account for authentication, the service account is the data owner, which can lead to unexpected behavior. For example, if a service account is the data owner, data ownership cannot be transferred. |
| [patch](/workspace/calendar/api/v3/reference/calendars/patch) | `PATCH  /calendars/calendarId` | Updates metadata for a calendar. This method supports patch semantics. Note that each patch request consumes three quota units; prefer using a `get` followed by an `update`. The field values you specify replace the existing values. Fields that you don't specify in the request remain unchanged. Array fields, if specified, overwrite the existing arrays; this discards any previous array elements. |
| [update](/workspace/calendar/api/v3/reference/calendars/update) | `PUT  /calendars/calendarId` | Updates metadata for a calendar. |

## Channels

For Channels Resource details, see the [resource representation](/workspace/calendar/api/v3/reference/channels#resource) page.

| Method | HTTP request | Description |
| --- | --- | --- |
| URIs relative to https://www.googleapis.com/calendar/v3, unless otherwise noted | | |
| [stop](/workspace/calendar/api/v3/reference/channels/stop) | `POST  /channels/stop` | Stop watching resources through this channel. |

## Colors

For Colors Resource details, see the [resource representation](/workspace/calendar/api/v3/reference/colors#resource) page.

| Method | HTTP request | Description |
| --- | --- | --- |
| URIs relative to https://www.googleapis.com/calendar/v3, unless otherwise noted | | |
| [get](/workspace/calendar/api/v3/reference/colors/get) | `GET  /colors` | Returns the color definitions for calendars and events. |

## Events

For Events Resource details, see the [resource representation](/workspace/calendar/api/v3/reference/events#resource) page.

| Method | HTTP request | Description |
| --- | --- | --- |
| URIs relative to https://www.googleapis.com/calendar/v3, unless otherwise noted | | |
| [delete](/workspace/calendar/api/v3/reference/events/delete) | `DELETE  /calendars/calendarId/events/eventId` | Deletes an event. |
| [get](/workspace/calendar/api/v3/reference/events/get) | `GET  /calendars/calendarId/events/eventId` | Returns an event based on its Google Calendar ID. To retrieve an event using its iCalendar ID, call the [events.list method using the `iCalUID` parameter](/workspace/calendar/api/v3/reference/events/list#iCalUID). |
| [import](/workspace/calendar/api/v3/reference/events/import) | `POST  /calendars/calendarId/events/import` | Imports an event. This operation is used to add a private copy of an existing event to a calendar. Only events with an `eventType` of `default` may be imported. **Deprecated behavior:** If a non-`default` event is imported, its type will be changed to `default` and any event-type-specific properties it may have will be dropped. |
| [insert](/workspace/calendar/api/v3/reference/events/insert) | `POST  /calendars/calendarId/events` | Creates an event. |
| [instances](/workspace/calendar/api/v3/reference/events/instances) | `GET  /calendars/calendarId/events/eventId/instances` | Returns instances of the specified recurring event. |
| [list](/workspace/calendar/api/v3/reference/events/list) | `GET  /calendars/calendarId/events` | Returns events on the specified calendar. |
| [move](/workspace/calendar/api/v3/reference/events/move) | `POST  /calendars/calendarId/events/eventId/move` | Moves an event to another calendar, i.e. changes an event's organizer. Note that only `default` events can be moved; `birthday`, `focusTime`, `fromGmail`, `outOfOffice` and `workingLocation` events cannot be moved. **Required query parameters:** `destination` |
| [patch](/workspace/calendar/api/v3/reference/events/patch) | `PATCH  /calendars/calendarId/events/eventId` | Updates an event. This method supports patch semantics. Note that each patch request consumes three quota units; prefer using a `get` followed by an `update`. The field values you specify replace the existing values. Fields that you don't specify in the request remain unchanged. Array fields, if specified, overwrite the existing arrays; this discards any previous array elements. |
| [quickAdd](/workspace/calendar/api/v3/reference/events/quickAdd) | `POST  /calendars/calendarId/events/quickAdd` | Creates an event based on a simple text string. **Required query parameters:** `text` |
| [update](/workspace/calendar/api/v3/reference/events/update) | `PUT  /calendars/calendarId/events/eventId` | Updates an event. This method does not support patch semantics and always updates the entire event resource. To do a partial update, perform a `get` followed by an `update` using etags to ensure atomicity. |
| [watch](/workspace/calendar/api/v3/reference/events/watch) | `POST  /calendars/calendarId/events/watch` | Watch for changes to Events resources. |

## Freebusy

For Freebusy Resource details, see the [resource representation](/workspace/calendar/api/v3/reference/freebusy#resource) page.

| Method | HTTP request | Description |
| --- | --- | --- |
| URIs relative to https://www.googleapis.com/calendar/v3, unless otherwise noted | | |
| [query](/workspace/calendar/api/v3/reference/freebusy/query) | `POST  /freeBusy` | Returns free/busy information for a set of calendars. |

## Settings

For Settings Resource details, see the [resource representation](/workspace/calendar/api/v3/reference/settings#resource) page.

| Method | HTTP request | Description |
| --- | --- | --- |
| URIs relative to https://www.googleapis.com/calendar/v3, unless otherwise noted | | |
| [get](/workspace/calendar/api/v3/reference/settings/get) | `GET  /users/me/settings/setting` | Returns a single user setting. |
| [list](/workspace/calendar/api/v3/reference/settings/list) | `GET  /users/me/settings` | Returns all user settings for the authenticated user. |
| [watch](/workspace/calendar/api/v3/reference/settings/watch) | `POST  /users/me/settings/watch` | Watch for changes to Settings resources. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/quickstarts-overview

Send feedback

# JavaScript quickstart Stay organized with collections Save and categorize content based on your preferences.

Create a JavaScript web application that makes requests to the Google Calendar API.

Quickstarts explain how to set up and run an app that calls a
Google Workspace API. This quickstart uses a
simplified authentication approach that is appropriate for a testing
environment. For a production environment, we recommend learning about
[authentication and authorization](/workspace/guides/auth-overview)
before
[choosing the access credentials](/workspace/guides/create-credentials#choose_the_access_credential_that_is_right_for_you)
that are appropriate for your app.

This quickstart uses Google Workspace's recommended API client libraries
to handle some details of the authentication and authorization flow.

## Objectives

* Set up your environment.
* Set up the sample.
* Run the sample.

## Prerequisites

* [Node.js & npm](https://docs.npmjs.com/getting-started/installing-node#1-install-nodejs--npm)
  installed.
* [A Google Cloud
  project](/workspace/guides/create-project).

* A Google account with Google Calendar enabled.

## Set up your environment

To complete this quickstart, set up your environment.

### Enable the API

Before using Google APIs, you need to turn them on in a Google Cloud project.
You can turn on one or more APIs in a single Google Cloud project.

* In the Google Cloud console, enable the Google Calendar API.

  [Enable the API](https://console.cloud.google.com/flows/enableapi?apiid=calendar-json.googleapis.com)

### Configure the OAuth consent screen

If you're using a new Google Cloud project to complete this quickstart, configure
the OAuth consent screen. If you've already
completed this step for your Cloud project, skip to the next section.

1. In the Google Cloud console, go to Menu menu
   > **Google Auth platform**
   > **Branding**.

   [Go to Branding](https://console.cloud.google.com/auth/branding)
2. If you have already configured the Google Auth platform, you can configure the following OAuth Consent Screen settings in [Branding](https://console.cloud.google.com/auth/branding), [Audience](https://console.cloud.google.com/auth/audience), and [Data Access](https://console.cloud.google.com/auth/scopes). If you see a message that says **Google Auth platform not configured yet**, click **Get Started**:

1. Under **App Information**, in **App name**, enter a name for the app.
2. In **User support email**, choose a support email address where users can contact you if they have questions about their consent.
3. Click **Next**.
4. Under **Audience**, select **Internal**.
5. Click **Next**.
6. Under **Contact Information**, enter an **Email address** where you can be notified about any changes to your project.
7. Click **Next**.
8. Under **Finish**, review the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy) and if you agree, select **I agree to the Google API Services: User Data Policy**.
9. Click **Continue**.
10. Click **Create**.

3. For now, you can skip adding scopes.
   In the future, when you create an app for use outside of your
   Google Workspace organization, you must change the **User type** to **External**. Then
   add the authorization scopes that your app requires. To learn more, see the full
   [Configure OAuth consent](/workspace/guides/configure-oauth-consent) guide.

### Authorize credentials for a web application

To authenticate end users and access user data in your app, you need to
create one or more OAuth 2.0 Client IDs. A client ID is used to identify a
single app to Google's OAuth servers. If your app runs on multiple platforms,
you must create a separate client ID for each platform.

1. In the Google Cloud console, go to Menu menu
   > **Google Auth platform**
   > **Clients**.

   [Go to Clients](https://console.cloud.google.com/auth/clients)
2. Click **Create Client**.
3. Click **Application type** > **Web application**.
4. In the **Name** field, type a name for the credential. This name is only shown in the Google Cloud console.
5. Add authorized URIs related to your app:
   * **Client-side apps (JavaScript)**–Under **Authorized JavaScript origins**, click **Add URI**. Then, enter a URI to use for browser requests. This identifies the domains from which your application can send API requests to the OAuth 2.0 server.
   * **Server-side apps (Java, Python, and more)**–Under **Authorized redirect URIs**, click **Add URI**. Then, enter an endpoint URI to which the OAuth 2.0 server can send responses.
6. Click **Create**.

   The newly created credential appears under **OAuth 2.0 Client IDs**.

   Note the Client ID. Client secrets aren't used for Web applications.

Make a note of these credentials because you need them later in this quickstart.

### Create an API key

1. In the Google Cloud console, go to Menu menu
   > **APIs & Services**
   > **Credentials**.

   [Go to Credentials](https://console.cloud.google.com/apis/credentials)
2. Click **Create credentials** >
   **API key**.
3. Your new API key is displayed.
   * Click Copy content\_copy to copy your API key for use
     in your app's code. The API key can also be found in the "API Keys" section of your
     project's credentials.
   * To prevent unauthorized use, we recommend restricting where and for which APIs the API key
     can be used. For more details, see
     [Add API restrictions](https://cloud.google.com/docs/authentication/api-keys#adding-api-restrictions).

## Set up the sample

1. In your working directory, create a file named `index.html`.
2. In the `index.html` file, paste the following sample code:

   calendar/quickstart/index.html

   [View on GitHub](https://github.com/googleworkspace/browser-samples/blob/main/calendar/quickstart/index.html)

   ```
   <!DOCTYPE html>
   <html>
     <head>
       <title>Google Calendar API Quickstart</title>
       <meta charset="utf-8" />
     </head>
     <body>
       <p>Google Calendar API Quickstart</p>

       <!--Add buttons to initiate auth sequence and sign out-->
       <button id="authorize_button" onclick="handleAuthClick()">Authorize</button>
       <button id="signout_button" onclick="handleSignoutClick()">Sign Out</button>

       <pre id="content" style="white-space: pre-wrap;"></pre>

       <script type="text/javascript">
         /* exported gapiLoaded */
         /* exported gisLoaded */
         /* exported handleAuthClick */
         /* exported handleSignoutClick */

         // TODO(developer): Set to client ID and API key from the Developer Console
         const CLIENT_ID = '<YOUR_CLIENT_ID>';
         const API_KEY = '<YOUR_API_KEY>';

         // Discovery doc URL for APIs used by the quickstart
         const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest';

         // Authorization scopes required by the API; multiple scopes can be
         // included, separated by spaces.
         const SCOPES = 'https://www.googleapis.com/auth/calendar.readonly';

         let tokenClient;
         let gapiInited = false;
         let gisInited = false;

         document.getElementById('authorize_button').style.visibility = 'hidden';
         document.getElementById('signout_button').style.visibility = 'hidden';

         /**
          * Callback after api.js is loaded.
          */
         function gapiLoaded() {
           gapi.load('client', initializeGapiClient);
         }

         /**
          * Callback after the API client is loaded. Loads the
          * discovery doc to initialize the API.
          */
         async function initializeGapiClient() {
           await gapi.client.init({
             apiKey: API_KEY,
             discoveryDocs: [DISCOVERY_DOC],
           });
           gapiInited = true;
           maybeEnableButtons();
         }

         /**
          * Callback after Google Identity Services are loaded.
          */
         function gisLoaded() {
           tokenClient = google.accounts.oauth2.initTokenClient({
             client_id: CLIENT_ID,
             scope: SCOPES,
             callback: '', // defined later
           });
           gisInited = true;
           maybeEnableButtons();
         }

         /**
          * Enables user interaction after all libraries are loaded.
          */
         function maybeEnableButtons() {
           if (gapiInited && gisInited) {
             document.getElementById('authorize_button').style.visibility = 'visible';
           }
         }

         /**
          *  Sign in the user upon button click.
          */
         function handleAuthClick() {
           tokenClient.callback = async (resp) => {
             if (resp.error !== undefined) {
               throw (resp);
             }
             document.getElementById('signout_button').style.visibility = 'visible';
             document.getElementById('authorize_button').innerText = 'Refresh';
             await listUpcomingEvents();
           };

           if (gapi.client.getToken() === null) {
             // Prompt the user to select a Google Account and ask for consent to share their data
             // when establishing a new session.
             tokenClient.requestAccessToken({prompt: 'consent'});
           } else {
             // Skip display of account chooser and consent dialog for an existing session.
             tokenClient.requestAccessToken({prompt: ''});
           }
         }

         /**
          *  Sign out the user upon button click.
          */
         function handleSignoutClick() {
           const token = gapi.client.getToken();
           if (token !== null) {
             google.accounts.oauth2.revoke(token.access_token);
             gapi.client.setToken('');
             document.getElementById('content').innerText = '';
             document.getElementById('authorize_button').innerText = 'Authorize';
             document.getElementById('signout_button').style.visibility = 'hidden';
           }
         }

         /**
          * Print the summary and start datetime/date of the next ten events in
          * the authorized user's calendar. If no events are found an
          * appropriate message is printed.
          */
         async function listUpcomingEvents() {
           let response;
           try {
             const request = {
               'calendarId': 'primary',
               'timeMin': (new Date()).toISOString(),
               'showDeleted': false,
               'singleEvents': true,
               'maxResults': 10,
               'orderBy': 'startTime',
             };
             response = await gapi.client.calendar.events.list(request);
           } catch (err) {
             document.getElementById('content').innerText = err.message;
             return;
           }

           const events = response.result.items;
           if (!events || events.length == 0) {
             document.getElementById('content').innerText = 'No events found.';
             return;
           }
           // Flatten to string to display
           const output = events.reduce(
               (str, event) => `${str}${event.summary} (${event.start.dateTime || event.start.date})\n`,
               'Events:\n');
           document.getElementById('content').innerText = output;
         }
       </script>
       <script async defer src="https://apis.google.com/js/api.js" onload="gapiLoaded()"></script>
       <script async defer src="https://accounts.google.com/gsi/client" onload="gisLoaded()"></script>
     </body>
   </html>
   ```

   Replace the following:

   * `YOUR_CLIENT_ID`: the client ID that you created
     when you
     [authorized credentials for a web application](#authorize_credentials_for_a_web_application).
   * `YOUR_API_KEY`: the API key that you created as
     a [Prerequisite](#prereqs).

## Run the sample

1. In your working directory, install the [http-server](https://www.npmjs.com/package/http-server) package:

   ```
   npm install http-server
   ```
2. In your working directory, start a web server:

   ```
   npx http-server -p 8000
   ```

3. In your browser, navigate to `http://localhost:8000`.
4. You see a prompt to authorize access:
   1. If you're not already signed in to your Google Account, sign in when prompted. If
      you're signed in to multiple accounts, select one account to use for authorization.
   2. Click **Accept**.

Your JavaScript application runs and calls the Google Calendar API.

## Next steps

* [Try the Google Workspace APIs in the APIs explorer](/workspace/explore)
  + [Create events](/workspace/calendar/create-events)
  + [Troubleshoot authentication and authorization issues](/workspace/calendar/api/troubleshoot-authentication-authorization)
  + [Calendar API reference documentation](/workspace/calendar/v3/reference)
  + [`google-api-javascript-client` section of GitHub](/api-client-library/javascript)




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/api/quickstart/js

Send feedback

# JavaScript quickstart Stay organized with collections Save and categorize content based on your preferences.

Create a JavaScript web application that makes requests to the Google Calendar API.

Quickstarts explain how to set up and run an app that calls a
Google Workspace API. This quickstart uses a
simplified authentication approach that is appropriate for a testing
environment. For a production environment, we recommend learning about
[authentication and authorization](/workspace/guides/auth-overview)
before
[choosing the access credentials](/workspace/guides/create-credentials#choose_the_access_credential_that_is_right_for_you)
that are appropriate for your app.

This quickstart uses Google Workspace's recommended API client libraries
to handle some details of the authentication and authorization flow.

## Objectives

* Set up your environment.
* Set up the sample.
* Run the sample.

## Prerequisites

* [Node.js & npm](https://docs.npmjs.com/getting-started/installing-node#1-install-nodejs--npm)
  installed.
* [A Google Cloud
  project](/workspace/guides/create-project).

* A Google account with Google Calendar enabled.

## Set up your environment

To complete this quickstart, set up your environment.

### Enable the API

Before using Google APIs, you need to turn them on in a Google Cloud project.
You can turn on one or more APIs in a single Google Cloud project.

* In the Google Cloud console, enable the Google Calendar API.

  [Enable the API](https://console.cloud.google.com/flows/enableapi?apiid=calendar-json.googleapis.com)

### Configure the OAuth consent screen

If you're using a new Google Cloud project to complete this quickstart, configure
the OAuth consent screen. If you've already
completed this step for your Cloud project, skip to the next section.

1. In the Google Cloud console, go to Menu menu
   > **Google Auth platform**
   > **Branding**.

   [Go to Branding](https://console.cloud.google.com/auth/branding)
2. If you have already configured the Google Auth platform, you can configure the following OAuth Consent Screen settings in [Branding](https://console.cloud.google.com/auth/branding), [Audience](https://console.cloud.google.com/auth/audience), and [Data Access](https://console.cloud.google.com/auth/scopes). If you see a message that says **Google Auth platform not configured yet**, click **Get Started**:

1. Under **App Information**, in **App name**, enter a name for the app.
2. In **User support email**, choose a support email address where users can contact you if they have questions about their consent.
3. Click **Next**.
4. Under **Audience**, select **Internal**.
5. Click **Next**.
6. Under **Contact Information**, enter an **Email address** where you can be notified about any changes to your project.
7. Click **Next**.
8. Under **Finish**, review the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy) and if you agree, select **I agree to the Google API Services: User Data Policy**.
9. Click **Continue**.
10. Click **Create**.

3. For now, you can skip adding scopes.
   In the future, when you create an app for use outside of your
   Google Workspace organization, you must change the **User type** to **External**. Then
   add the authorization scopes that your app requires. To learn more, see the full
   [Configure OAuth consent](/workspace/guides/configure-oauth-consent) guide.

### Authorize credentials for a web application

To authenticate end users and access user data in your app, you need to
create one or more OAuth 2.0 Client IDs. A client ID is used to identify a
single app to Google's OAuth servers. If your app runs on multiple platforms,
you must create a separate client ID for each platform.

1. In the Google Cloud console, go to Menu menu
   > **Google Auth platform**
   > **Clients**.

   [Go to Clients](https://console.cloud.google.com/auth/clients)
2. Click **Create Client**.
3. Click **Application type** > **Web application**.
4. In the **Name** field, type a name for the credential. This name is only shown in the Google Cloud console.
5. Add authorized URIs related to your app:
   * **Client-side apps (JavaScript)**–Under **Authorized JavaScript origins**, click **Add URI**. Then, enter a URI to use for browser requests. This identifies the domains from which your application can send API requests to the OAuth 2.0 server.
   * **Server-side apps (Java, Python, and more)**–Under **Authorized redirect URIs**, click **Add URI**. Then, enter an endpoint URI to which the OAuth 2.0 server can send responses.
6. Click **Create**.

   The newly created credential appears under **OAuth 2.0 Client IDs**.

   Note the Client ID. Client secrets aren't used for Web applications.

Make a note of these credentials because you need them later in this quickstart.

### Create an API key

1. In the Google Cloud console, go to Menu menu
   > **APIs & Services**
   > **Credentials**.

   [Go to Credentials](https://console.cloud.google.com/apis/credentials)
2. Click **Create credentials** >
   **API key**.
3. Your new API key is displayed.
   * Click Copy content\_copy to copy your API key for use
     in your app's code. The API key can also be found in the "API Keys" section of your
     project's credentials.
   * To prevent unauthorized use, we recommend restricting where and for which APIs the API key
     can be used. For more details, see
     [Add API restrictions](https://cloud.google.com/docs/authentication/api-keys#adding-api-restrictions).

## Set up the sample

1. In your working directory, create a file named `index.html`.
2. In the `index.html` file, paste the following sample code:

   calendar/quickstart/index.html

   [View on GitHub](https://github.com/googleworkspace/browser-samples/blob/main/calendar/quickstart/index.html)

   ```
   <!DOCTYPE html>
   <html>
     <head>
       <title>Google Calendar API Quickstart</title>
       <meta charset="utf-8" />
     </head>
     <body>
       <p>Google Calendar API Quickstart</p>

       <!--Add buttons to initiate auth sequence and sign out-->
       <button id="authorize_button" onclick="handleAuthClick()">Authorize</button>
       <button id="signout_button" onclick="handleSignoutClick()">Sign Out</button>

       <pre id="content" style="white-space: pre-wrap;"></pre>

       <script type="text/javascript">
         /* exported gapiLoaded */
         /* exported gisLoaded */
         /* exported handleAuthClick */
         /* exported handleSignoutClick */

         // TODO(developer): Set to client ID and API key from the Developer Console
         const CLIENT_ID = '<YOUR_CLIENT_ID>';
         const API_KEY = '<YOUR_API_KEY>';

         // Discovery doc URL for APIs used by the quickstart
         const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest';

         // Authorization scopes required by the API; multiple scopes can be
         // included, separated by spaces.
         const SCOPES = 'https://www.googleapis.com/auth/calendar.readonly';

         let tokenClient;
         let gapiInited = false;
         let gisInited = false;

         document.getElementById('authorize_button').style.visibility = 'hidden';
         document.getElementById('signout_button').style.visibility = 'hidden';

         /**
          * Callback after api.js is loaded.
          */
         function gapiLoaded() {
           gapi.load('client', initializeGapiClient);
         }

         /**
          * Callback after the API client is loaded. Loads the
          * discovery doc to initialize the API.
          */
         async function initializeGapiClient() {
           await gapi.client.init({
             apiKey: API_KEY,
             discoveryDocs: [DISCOVERY_DOC],
           });
           gapiInited = true;
           maybeEnableButtons();
         }

         /**
          * Callback after Google Identity Services are loaded.
          */
         function gisLoaded() {
           tokenClient = google.accounts.oauth2.initTokenClient({
             client_id: CLIENT_ID,
             scope: SCOPES,
             callback: '', // defined later
           });
           gisInited = true;
           maybeEnableButtons();
         }

         /**
          * Enables user interaction after all libraries are loaded.
          */
         function maybeEnableButtons() {
           if (gapiInited && gisInited) {
             document.getElementById('authorize_button').style.visibility = 'visible';
           }
         }

         /**
          *  Sign in the user upon button click.
          */
         function handleAuthClick() {
           tokenClient.callback = async (resp) => {
             if (resp.error !== undefined) {
               throw (resp);
             }
             document.getElementById('signout_button').style.visibility = 'visible';
             document.getElementById('authorize_button').innerText = 'Refresh';
             await listUpcomingEvents();
           };

           if (gapi.client.getToken() === null) {
             // Prompt the user to select a Google Account and ask for consent to share their data
             // when establishing a new session.
             tokenClient.requestAccessToken({prompt: 'consent'});
           } else {
             // Skip display of account chooser and consent dialog for an existing session.
             tokenClient.requestAccessToken({prompt: ''});
           }
         }

         /**
          *  Sign out the user upon button click.
          */
         function handleSignoutClick() {
           const token = gapi.client.getToken();
           if (token !== null) {
             google.accounts.oauth2.revoke(token.access_token);
             gapi.client.setToken('');
             document.getElementById('content').innerText = '';
             document.getElementById('authorize_button').innerText = 'Authorize';
             document.getElementById('signout_button').style.visibility = 'hidden';
           }
         }

         /**
          * Print the summary and start datetime/date of the next ten events in
          * the authorized user's calendar. If no events are found an
          * appropriate message is printed.
          */
         async function listUpcomingEvents() {
           let response;
           try {
             const request = {
               'calendarId': 'primary',
               'timeMin': (new Date()).toISOString(),
               'showDeleted': false,
               'singleEvents': true,
               'maxResults': 10,
               'orderBy': 'startTime',
             };
             response = await gapi.client.calendar.events.list(request);
           } catch (err) {
             document.getElementById('content').innerText = err.message;
             return;
           }

           const events = response.result.items;
           if (!events || events.length == 0) {
             document.getElementById('content').innerText = 'No events found.';
             return;
           }
           // Flatten to string to display
           const output = events.reduce(
               (str, event) => `${str}${event.summary} (${event.start.dateTime || event.start.date})\n`,
               'Events:\n');
           document.getElementById('content').innerText = output;
         }
       </script>
       <script async defer src="https://apis.google.com/js/api.js" onload="gapiLoaded()"></script>
       <script async defer src="https://accounts.google.com/gsi/client" onload="gisLoaded()"></script>
     </body>
   </html>
   ```

   Replace the following:

   * `YOUR_CLIENT_ID`: the client ID that you created
     when you
     [authorized credentials for a web application](#authorize_credentials_for_a_web_application).
   * `YOUR_API_KEY`: the API key that you created as
     a [Prerequisite](#prereqs).

## Run the sample

1. In your working directory, install the [http-server](https://www.npmjs.com/package/http-server) package:

   ```
   npm install http-server
   ```
2. In your working directory, start a web server:

   ```
   npx http-server -p 8000
   ```

3. In your browser, navigate to `http://localhost:8000`.
4. You see a prompt to authorize access:
   1. If you're not already signed in to your Google Account, sign in when prompted. If
      you're signed in to multiple accounts, select one account to use for authorization.
   2. Click **Accept**.

Your JavaScript application runs and calls the Google Calendar API.

## Next steps

* [Try the Google Workspace APIs in the APIs explorer](/workspace/explore)
  + [Create events](/workspace/calendar/create-events)
  + [Troubleshoot authentication and authorization issues](/workspace/calendar/api/troubleshoot-authentication-authorization)
  + [Calendar API reference documentation](/workspace/calendar/v3/reference)
  + [`google-api-javascript-client` section of GitHub](/api-client-library/javascript)




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/api/concepts

Send feedback

# Concepts overview Stay organized with collections Save and categorize content based on your preferences.

Each Calendar user is associated with a primary calendar and a
number of other calendars that they can also access. Users can create events and
invite other users, as shown in the following diagram:

This example shows two users, Susan A and Wei X. Each has a primary calendar and
several other associated calendars. The example also shows two events: an
end-of-year presentation and a team offsite.

Here are some facts shown in the diagram:

* Susan's calendar list includes her primary calendar as well as calendars for
  her team and cello lessons.
* Wei's calendar list includes his primary calendar as well as the team
  calendar, a status tracking calendar, and Susan's primary calendar.
* The end-of-year presentation event shows Susan as the organizer and Wei as an
  attendee.
* The team off-site in Hawaii event has the team calendar as an organizer
  (meaning it was created in that calendar) and copied to Susan and Wei as
  attendees.

These concepts: calendars, events, attendees, and others are all explained
further in the other sections of this guide:

* [Calendars and Events](/workspace/calendar/api/concepts/events-calendars)
* [Calendar sharing](/workspace/calendar/api/concepts/sharing)
* [Invite users to an event](/workspace/calendar/api/concepts/inviting-attendees-to-events)
* [Reminders and Notification](/workspace/calendar/api/concepts/reminders)
* [Google Workspace Features](/workspace/calendar/api/concepts/domain)




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/api/guides/sync

Send feedback

# Synchronize resources efficiently Stay organized with collections Save and categorize content based on your preferences.

This guide describes how to
implement "incremental synchronization" of calendar data. Using this
method, you can keep data for all calendar collections in sync while saving
bandwidth.

## Contents

## Overview

Incremental synchronization consists of two stages:

1. Initial full sync is performed once at the very beginning in order to fully
   synchronize the client’s state with the server’s state. The client will obtain
   a sync token that it needs to persist.
2. Incremental sync is performed repeatedly and updates the client with all
   the changes that happened ever since the previous sync. Each time, the client
   provides the previous sync token it obtained from the server and stores the new sync token from the response.

A **sync token** is a piece of data
exchanged between the server and the client, and has a critical role in
the synchronization process. An example would look like the following:

`"nextSyncToken": "CPDAlvWDx70CEPDAlvWDx70CGAU=",`

## Initial full sync

The initial full sync is the original request for all the resources of the
collection you want to synchronize. You can optionally restrict the list
request using request parameters if you only want to synchronize a specific
subset of resources.

In the response to the list operation, you will find a field called
`nextSyncToken` representing a sync token. You'll need to store the value of
`nextSyncToken`. If the result set is too large and the response gets
[paginated](/workspace/calendar/v3/pagination), then the `nextSyncToken`
field is present only on the very last page.

You don’t need to worry about any new entries appearing
while you are paginating — they won’t be missed. The information
needed for the server to generate a correct sync token is encoded in the
page token.

## Incremental sync

Incremental sync allows you to retrieve all the resources that have been
modified since the last sync request. To do this, you need to perform a list
request with your most recent sync token specified in the `syncToken` field.
Keep in mind that the result will always contain deleted entries, so that the
clients get the chance to remove them from storage.

In cases where a large number of resources have changed since the last
incremental sync request, you may find a `pageToken` instead of a `syncToken` in the list result. In these cases you'll need to perform the exact same
list query as was used for retrieval of the first page in the incremental sync
(with the exact same `syncToken`), append the `pageToken` to it and
paginate through all the following requests until you find another `syncToken` on the last page. Make sure to store this `syncToken` for the next sync
request in the future.

Here are example queries for a case requiring incremental paginated sync:

**Original query**

```
GET /calendars/primary/events?maxResults=10&singleEvents=true&syncToken=CPDAlvWDx70CEPDAlvWDx

// Result contains the following

"nextPageToken":"CiAKGjBpNDd2Nmp2Zml2cXRwYjBpOXA",
```

**Retrieving next page**

```
GET /calendars/primary/events?maxResults=10&singleEvents=true&syncToken=CPDAlvWDx70CEPDAlvWDx&pageToken=CiAKGjBpNDd2Nmp2Zml2cXRwYjBpOXA
```

The set of query parameters that can be used on incremental
syncs is restricted. Each list request should use the same set of query
parameters, including the initial request. For the individual restrictions on
each collection, see the corresponding documentation for list requests. The
response code for list queries containing disallowed restrictions is
`400`. 

## Full sync required by server

Sometimes sync tokens are invalidated by the server, for various reasons
including token expiration or changes in related ACLs.
In such cases, the server will respond to an incremental request with a
response code `410`. This should trigger a full wipe of the client’s store
and a new full sync.

## Sample code

The snippet of sample code below demonstrates how to use sync tokens with the
[Java client library](/api-client-library/java/apis/calendar/v3). The first time
the run method is called it will perform a full sync and store the sync token.
On each subsequent execution it will load the saved sync token and perform an
incremental sync.

```
  private static void run() throws IOException {
    // Construct the {@link Calendar.Events.List} request, but don't execute it yet.
    Calendar.Events.List request = client.events().list("primary");

    // Load the sync token stored from the last execution, if any.
    String syncToken = syncSettingsDataStore.get(SYNC_TOKEN_KEY);
    if (syncToken == null) {
      System.out.println("Performing full sync.");

      // Set the filters you want to use during the full sync. Sync tokens aren't compatible with
      // most filters, but you may want to limit your full sync to only a certain date range.
      // In this example we are only syncing events up to a year old.
      Date oneYearAgo = Utils.getRelativeDate(java.util.Calendar.YEAR, -1);
      request.setTimeMin(new DateTime(oneYearAgo, TimeZone.getTimeZone("UTC")));
    } else {
      System.out.println("Performing incremental sync.");
      request.setSyncToken(syncToken);
    }

    // Retrieve the events, one page at a time.
    String pageToken = null;
    Events events = null;
    do {
      request.setPageToken(pageToken);

      try {
        events = request.execute();
      } catch (GoogleJsonResponseException e) {
        if (e.getStatusCode() == 410) {
          // A 410 status code, "Gone", indicates that the sync token is invalid.
          System.out.println("Invalid sync token, clearing event store and re-syncing.");
          syncSettingsDataStore.delete(SYNC_TOKEN_KEY);
          eventDataStore.clear();
          run();
        } else {
          throw e;
        }
      }

      List<Event> items = events.getItems();
      if (items.size() == 0) {
        System.out.println("No new events to sync.");
      } else {
        for (Event event : items) {
          syncEvent(event);
        }
      }

      pageToken = events.getNextPageToken();
    } while (pageToken != null);

    // Store the sync token from the last request to be used during the next execution.
    syncSettingsDataStore.set(SYNC_TOKEN_KEY, events.getNextSyncToken());

    System.out.println("Sync complete.");
  }

SyncTokenSample.java
```

## Legacy synchronization

For event collections, it is still possible to do synchronization in the
legacy manner by preserving the value of the updated field from an events list
request and then using the `modifiedSince` field to retrieve updated events.
This approach is no longer recommended as it is more error-prone with respect
to missed updates (for example if does not enforce query restrictions).
Furthermore, it is available only for events.




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/api/concepts/sharing

Send feedback

# Calendar sharing Stay organized with collections Save and categorize content based on your preferences.

There are two different ways to share calendar and event data with others.

Firstly, you can *share* an entire calendar, with a specified level of access.
For example, you can create a team calendar, and then do things like:

* Grant all members of your team the right to add and modify events in the
  calendar
* Grant your boss the right to see the events on your calendar
* Grant your customers the right to only see when you are free or busy, but not
  the details of the events

You can also adjust the access to individual events on the shared calendar.

Alternatively, you can invite others to individual events on your calendar.
Inviting someone to an event puts a copy of that event on their calendar. The
copy on the attendee's calendar is visible to others according to the
attendee's sharing configuration.
The invitee can then accept or reject the invitation, and to some extent also
modify their copy of the event — for example, change the color it has in
their calendar, and add a reminder. [Learn more about inviting users to an
event](/workspace/calendar/api/concepts/inviting-attendees-to-events).

## Sharing calendars

The owners of a calendar can share the calendar by giving access to other
users. The sharing settings of a given calendar are represented by the [ACL
collection](/workspace/calendar/v3/reference/acl)
(access control list) of that calendar. Each resource in the ACL
collection grants a specified *grantee* a certain access *role*, which is
one of those listed in the following table:

| Role | Access privilege granted by the role |
| --- | --- |
| `none` | Provides no access. |
| `freeBusyReader` | Lets the grantee see whether the calendar is free or busy at a given time, but does not allow access to event details. Free/busy information can be retrieved using the [freeBusy.query](/workspace/calendar/v3/reference/freebusy/query) operation. |
| `reader` | Lets the grantee read events on the calendar. |
| `writer` | Lets the grantee read and write events on the calendar. This role can also see ACLs. |
| `owner` | Provides manager access to the calendar. This role has all of the permissions of the writer role with the additional ability to modify access levels of other users. **Important:** the `owner` role is different from the calendar's data owner. A calendar has a single data owner, but can have multiple users with `owner` role. |

The possible grantees are:

* another individual user
* a user group
* a domain
* public (grants access to everyone).

By default, each user has owner access to their primary calendar, and this
access cannot be relinquished. Up to 6,000 ACLs can be added per calendar.

For Google Workspace users, there are also domain
settings that might restrict the
maximum allowed access. For example, suppose your domain has a setting that
only allows free-busy calendar sharing. In this case, even if you grant writer
access to the public, users outside the domain will only see the free-busy
details.

**Note:** Sharing a calendar with a user no longer automatically inserts the
calendar into their `CalendarList`. If you want the user to see and
interact with the shared calendar, you need to call the
[`CalendarList: insert()`](/workspace/calendar/v3/reference/calendarList/insert) method.

## Event visibility

Once the calendar is shared, you can adjust the access to individual
events on a calendar by changing the [visibility
property](/workspace/calendar/v3/reference/events#visibility) of the event.
This property has no meaning for non-shared calendars. The following table
lists the possible values of the visibility property:

| Visibility | Meaning |
| --- | --- |
| `default` | The visibility of the event is determined by the ACLs of the calendar. Different attendees of the same event can have different ACLs and sharing. If a user with a `private` calendar sends an invite to an event using `default` visibility to another user with a publicly visible calendar, the event is fully visible on that attendee's calendar. |
| `public` | The details of this event are visible to everyone with at least `freeBusyReader` access to the calendar. |
| `private` | The details of this event are only visible to users with at least `writer` access to the calendar. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/api/v3/reference/calendarList/get

Send feedback

# CalendarList: get Stay organized with collections Save and categorize content based on your preferences.

**Note:**
Requires [authorization](#auth).

Returns a calendar from the user's calendar list.
[Try it now](#try-it).

## Request

### HTTP request

```
GET https://www.googleapis.com/calendar/v3/users/me/calendarList/calendarId
```

### Parameters

| Parameter name | Value | Description |
| --- | --- | --- |
| **Path parameters** | | |
| `calendarId` | `string` | Calendar identifier. To retrieve calendar IDs call the [calendarList.list](/workspace/calendar/api/v3/reference/calendarList/list) method. If you want to access the primary calendar of the currently logged in user, use the "`primary`" keyword. |

### Authorization

This request requires authorization with at least one of the following scopes:

| Scope |
| --- |
| `https://www.googleapis.com/auth/calendar.readonly` |
| `https://www.googleapis.com/auth/calendar` |
| `https://www.googleapis.com/auth/calendar.app.created` |
| `https://www.googleapis.com/auth/calendar.calendarlist` |
| `https://www.googleapis.com/auth/calendar.calendarlist.readonly` |

For more information, see the [authentication and authorization](/workspace/guides/configure-oauth-consent) page.

### Request body

Do not supply a request body with this method.

## Response

If successful, this method returns a [CalendarList resource](/workspace/calendar/api/v3/reference/calendarList#resource) in the response body.




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/api/v3/reference/events

Send feedback

# Events Stay organized with collections Save and categorize content based on your preferences.

The Calendar API provides different flavors of event resources, more information can be found in [About events](/workspace/calendar/api/concepts#events_resource).

For a list of [methods](#methods) for this resource, see the end of this page.

## Resource representations

```
{
  "kind": "calendar#event",
  "etag": etag,
  "id": string,
  "status": string,
  "htmlLink": string,
  "created": datetime,
  "updated": datetime,
  "summary": string,
  "description": string,
  "location": string,
  "colorId": string,
  "creator": {
    "id": string,
    "email": string,
    "displayName": string,
    "self": boolean
  },
  "organizer": {
    "id": string,
    "email": string,
    "displayName": string,
    "self": boolean
  },
  "start": {
    "date": date,
    "dateTime": datetime,
    "timeZone": string
  },
  "end": {
    "date": date,
    "dateTime": datetime,
    "timeZone": string
  },
  "endTimeUnspecified": boolean,
  "recurrence": [
    string
  ],
  "recurringEventId": string,
  "originalStartTime": {
    "date": date,
    "dateTime": datetime,
    "timeZone": string
  },
  "transparency": string,
  "visibility": string,
  "iCalUID": string,
  "sequence": integer,
  "attendees": [
    {
      "id": string,
      "email": string,
      "displayName": string,
      "organizer": boolean,
      "self": boolean,
      "resource": boolean,
      "optional": boolean,
      "responseStatus": string,
      "comment": string,
      "additionalGuests": integer
    }
  ],
  "attendeesOmitted": boolean,
  "extendedProperties": {
    "private": {
      (key): string
    },
    "shared": {
      (key): string
    }
  },
  "hangoutLink": string,
  "conferenceData": {
    "createRequest": {
      "requestId": string,
      "conferenceSolutionKey": {
        "type": string
      },
      "status": {
        "statusCode": string
      }
    },
    "entryPoints": [
      {
        "entryPointType": string,
        "uri": string,
        "label": string,
        "pin": string,
        "accessCode": string,
        "meetingCode": string,
        "passcode": string,
        "password": string
      }
    ],
    "conferenceSolution": {
      "key": {
        "type": string
      },
      "name": string,
      "iconUri": string
    },
    "conferenceId": string,
    "signature": string,
    "notes": string,
  },
  "gadget": {
    "type": string,
    "title": string,
    "link": string,
    "iconLink": string,
    "width": integer,
    "height": integer,
    "display": string,
    "preferences": {
      (key): string
    }
  },
  "anyoneCanAddSelf": boolean,
  "guestsCanInviteOthers": boolean,
  "guestsCanModify": boolean,
  "guestsCanSeeOtherGuests": boolean,
  "privateCopy": boolean,
  "locked": boolean,
  "reminders": {
    "useDefault": boolean,
    "overrides": [
      {
        "method": string,
        "minutes": integer
      }
    ]
  },
  "source": {
    "url": string,
    "title": string
  },
  "workingLocationProperties": {
    "type": string,
    "homeOffice": (value),
    "customLocation": {
      "label": string
    },
    "officeLocation": {
      "buildingId": string,
      "floorId": string,
      "floorSectionId": string,
      "deskId": string,
      "label": string
    }
  },
  "outOfOfficeProperties": {
    "autoDeclineMode": string,
    "declineMessage": string
  },
  "focusTimeProperties": {
    "autoDeclineMode": string,
    "declineMessage": string,
    "chatStatus": string
  },
  "attachments": [
    {
      "fileUrl": string,
      "title": string,
      "mimeType": string,
      "iconLink": string,
      "fileId": string
    }
  ],
  "birthdayProperties": {
    "contact": string,
    "type": string,
    "customTypeName": string
  },
  "eventType": string
}
```

| Property name | Value | Description | Notes |
| --- | --- | --- | --- |
| `anyoneCanAddSelf` | `boolean` | Whether anyone can invite themselves to the event (deprecated). Optional. The default is False. | writable |
| `attachments[]` | `list` | File attachments for the event. In order to modify attachments the `supportsAttachments` request parameter should be set to `true`.  There can be at most 25 attachments per event, |  |
| `attachments[].fileId` | `string` | ID of the attached file. Read-only. For Google Drive files, this is the ID of the corresponding [`Files`](/drive/v3/reference/files) resource entry in the Drive API. |  |
| `attachments[].fileUrl` | `string` | URL link to the attachment. For adding Google Drive file attachments use the same format as in `alternateLink` property of the `Files` resource in the Drive API.  Required when adding an attachment. | writable |
| `attachments[].iconLink` | `string` | URL link to the attachment's icon. This field can only be modified for custom third-party attachments. |  |
| `attachments[].mimeType` | `string` | Internet media type (MIME type) of the attachment. |  |
| `attachments[].title` | `string` | Attachment title. |  |
| `attendeesOmitted` | `boolean` | Whether attendees may have been omitted from the event's representation. When retrieving an event, this may be due to a restriction specified by the `maxAttendee` query parameter. When updating an event, this can be used to only update the participant's response. Optional. The default is False. | writable |
| `attendees[]` | `list` | The attendees of the event. See the [Events with attendees](/calendar/concepts/sharing) guide for more information on scheduling events with other calendar users. Service accounts need to use [domain-wide delegation of authority](/calendar/auth#perform-g-suite-domain-wide-delegation-of-authority) to populate the attendee list. | writable |
| `attendees[].additionalGuests` | `integer` | Number of additional guests. Optional. The default is 0. | writable |
| `attendees[].comment` | `string` | The attendee's response comment. Optional. | writable |
| `attendees[].displayName` | `string` | The attendee's name, if available. Optional. | writable |
| `attendees[].email` | `string` | The attendee's email address, if available. This field must be present when adding an attendee. It must be a valid email address as per [RFC5322](https://tools.ietf.org/html/rfc5322#section-3.4). Required when adding an attendee. | writable |
| `attendees[].id` | `string` | The attendee's Profile ID, if available. |  |
| `attendees[].optional` | `boolean` | Whether this is an optional attendee. Optional. The default is False. | writable |
| `attendees[].organizer` | `boolean` | Whether the attendee is the organizer of the event. Read-only. The default is False. |  |
| `attendees[].resource` | `boolean` | Whether the attendee is a resource. Can only be set when the attendee is added to the event for the first time. Subsequent modifications are ignored. Optional. The default is False. | writable |
| `attendees[].responseStatus` | `string` | The attendee's response status. Possible values are:  * "`needsAction`" - The attendee has not responded to the invitation (recommended for new events). * "`declined`" - The attendee has declined the invitation. * "`tentative`" - The attendee has tentatively accepted the invitation. * "`accepted`" - The attendee has accepted the invitation.  **Warning:** If you add an event using the values `declined`, `tentative`, or `accepted`, attendees with the "Add invitations to my calendar" setting set to "When I respond to invitation in email" or "Only if the sender is known" might have their response reset to `needsAction` and won't see an event in their calendar unless they change their response in the event invitation email. Furthermore, if more than 200 guests are invited to the event, response status is not propagated to the guests. | writable |
| `attendees[].self` | `boolean` | Whether this entry represents the calendar on which this copy of the event appears. Read-only. The default is False. |  |
| `birthdayProperties` | `nested object` | Birthday or special event data. Used if `eventType` is `"birthday"`. Immutable. | writable |
| `birthdayProperties.contact` | `string` | Resource name of the contact this birthday event is linked to. This can be used to fetch contact details from [People API](/people). Format: `"people/c12345"`. Read-only. |  |
| `birthdayProperties.customTypeName` | `string` | Custom type label specified for this event. This is populated if `birthdayProperties.type` is set to `"custom"`. Read-only. |  |
| `birthdayProperties.type` | `string` | Type of birthday or special event. Possible values are:  * `"anniversary"` - An anniversary other than birthday. Always has a `contact`. * `"birthday"` - A birthday event. This is the default value. * `"custom"` - A special date whose label is further specified in the `customTypeName` field. Always has a `contact`. * `"other"` - A special date which does not fall into the other categories, and does not have a custom label. Always has a `contact`. * `"self"` - Calendar owner's own birthday. Cannot have a `contact`.  The Calendar API only supports creating events with the type `"birthday"`. The type cannot be changed after the event is created. | writable |
| `colorId` | `string` | The color of the event. This is an ID referring to an entry in the `event` section of the colors definition (see the  [colors endpoint](/calendar/v3/reference/colors)). Optional. | writable |
| `conferenceData` | `nested object` | The conference-related information, such as details of a Google Meet conference. To create new conference details use the `createRequest` field. To persist your changes, remember to set the `conferenceDataVersion` request parameter to `1` for all event modification requests. **Warning:** Reusing Google Meet conference data across different events can cause access issues and expose meeting details to unintended users. To help ensure meeting privacy, always generate a unique conference for each event by using the `createRequest` field. | writable |
| `conferenceData.conferenceId` | `string` | The ID of the conference. Can be used by developers to keep track of conferences, should not be displayed to users.  The ID value is formed differently for each conference solution type:   * `eventHangout`: ID is not set. (This conference type is deprecated.) * `eventNamedHangout`: ID is the name of the Hangout. (This conference type is deprecated.) * `hangoutsMeet`: ID is the 10-letter meeting code, for example `aaa-bbbb-ccc`. * `addOn`: ID is defined by the third-party provider.  Optional. |  |
| `conferenceData.conferenceSolution` | `nested object` | The conference solution, such as Google Meet. Unset for a conference with a failed create request.  Either `conferenceSolution` and at least one `entryPoint`, or `createRequest` is required. |  |
| `conferenceData.conferenceSolution.iconUri` | `string` | The user-visible icon for this solution. |  |
| `conferenceData.conferenceSolution.key` | `nested object` | The key which can uniquely identify the conference solution for this event. |  |
| `conferenceData.conferenceSolution.key.type` | `string` | The conference solution type. If a client encounters an unfamiliar or empty type, it should still be able to display the entry points. However, it should disallow modifications.  The possible values are:   * `"eventHangout"` for Hangouts for consumers (deprecated; existing events may show this conference solution type but new conferences cannot be created) * `"eventNamedHangout"` for classic Hangouts for Google Workspace users (deprecated; existing events may show this conference solution type but new conferences cannot be created) * `"hangoutsMeet"` for Google Meet (http://meet.google.com) * `"addOn"` for 3P conference providers |  |
| `conferenceData.conferenceSolution.name` | `string` | The user-visible name of this solution. Not localized. |  |
| `conferenceData.createRequest` | `nested object` | A request to generate a new conference and attach it to the event. The data is generated asynchronously. To see whether the data is present check the `status` field. Either `conferenceSolution` and at least one `entryPoint`, or `createRequest` is required. |  |
| `conferenceData.createRequest.conferenceSolutionKey` | `nested object` | The conference solution, such as Hangouts or Google Meet. |  |
| `conferenceData.createRequest.conferenceSolutionKey.type` | `string` | The conference solution type. If a client encounters an unfamiliar or empty type, it should still be able to display the entry points. However, it should disallow modifications.  The possible values are:   * `"eventHangout"` for Hangouts for consumers (deprecated; existing events may show this conference solution type but new conferences cannot be created) * `"eventNamedHangout"` for classic Hangouts for Google Workspace users (deprecated; existing events may show this conference solution type but new conferences cannot be created) * `"hangoutsMeet"` for Google Meet (http://meet.google.com) * `"addOn"` for 3P conference providers |  |
| `conferenceData.createRequest.requestId` | `string` | The client-generated unique ID for this request. Clients should regenerate this ID for every new request. If an ID provided is the same as for the previous request, the request is ignored. |  |
| `conferenceData.createRequest.status` | `nested object` | The status of the conference create request. |  |
| `conferenceData.createRequest.status.statusCode` | `string` | The current status of the conference create request. Read-only. The possible values are:   * `"pending"`: the conference create request is still being processed. * `"success"`: the conference create request succeeded, the entry points are populated. * `"failure"`: the conference create request failed, there are no entry points. |  |
| `conferenceData.entryPoints[]` | `list` | Information about individual conference entry points, such as URLs or phone numbers. All of them must belong to the same conference.  Either `conferenceSolution` and at least one `entryPoint`, or `createRequest` is required. |  |
| `conferenceData.entryPoints[].accessCode` | `string` | The access code to access the conference. The maximum length is 128 characters. When creating new conference data, populate only the subset of {`meetingCode`, `accessCode`, `passcode`, `password`, `pin`} fields that match the terminology that the conference provider uses. Only the populated fields should be displayed.  Optional. |  |
| `conferenceData.entryPoints[].entryPointType` | `string` | The type of the conference entry point. Possible values are:   * `"video"` - joining a conference over HTTP. A conference can have zero or one `video` entry point. * `"phone"` - joining a conference by dialing a phone number. A conference can have zero or more `phone` entry points. * `"sip"` - joining a conference over SIP. A conference can have zero or one `sip` entry point. * `"more"` - further conference joining instructions, for example additional phone numbers. A conference can have zero or one `more` entry point. A conference with only a `more` entry point is not a valid conference. |  |
| `conferenceData.entryPoints[].label` | `string` | The label for the URI. Visible to end users. Not localized. The maximum length is 512 characters. Examples:   * for `video`: meet.google.com/aaa-bbbb-ccc * for `phone`: +1 123 268 2601 * for `sip`: 12345678@altostrat.com * for `more`: should not be filled   Optional. |  |
| `conferenceData.entryPoints[].meetingCode` | `string` | The meeting code to access the conference. The maximum length is 128 characters. When creating new conference data, populate only the subset of {`meetingCode`, `accessCode`, `passcode`, `password`, `pin`} fields that match the terminology that the conference provider uses. Only the populated fields should be displayed.  Optional. |  |
| `conferenceData.entryPoints[].passcode` | `string` | The passcode to access the conference. The maximum length is 128 characters. When creating new conference data, populate only the subset of {`meetingCode`, `accessCode`, `passcode`, `password`, `pin`} fields that match the terminology that the conference provider uses. Only the populated fields should be displayed. |  |
| `conferenceData.entryPoints[].password` | `string` | The password to access the conference. The maximum length is 128 characters. When creating new conference data, populate only the subset of {`meetingCode`, `accessCode`, `passcode`, `password`, `pin`} fields that match the terminology that the conference provider uses. Only the populated fields should be displayed.  Optional. |  |
| `conferenceData.entryPoints[].pin` | `string` | The PIN to access the conference. The maximum length is 128 characters. When creating new conference data, populate only the subset of {`meetingCode`, `accessCode`, `passcode`, `password`, `pin`} fields that match the terminology that the conference provider uses. Only the populated fields should be displayed.  Optional. |  |
| `conferenceData.entryPoints[].uri` | `string` | The URI of the entry point. The maximum length is 1300 characters. Format:   * for `video`, `http:` or `https:` schema is required. * for `phone`, `tel:` schema is required. The URI should include the entire dial sequence (e.g., tel:+12345678900,,,123456789;1234). * for `sip`, `sip:` schema is required, e.g., sip:12345678@myprovider.com. * for `more`, `http:` or `https:` schema is required. |  |
| `conferenceData.notes` | `string` | Additional notes (such as instructions from the domain administrator, legal notices) to display to the user. Can contain HTML. The maximum length is 2048 characters. Optional. |  |
| `conferenceData.signature` | `string` | The signature of the conference data. Generated on server side.  Unset for a conference with a failed create request.  Optional for a conference with a pending create request. |  |
| `created` | `datetime` | Creation time of the event (as a [RFC3339](https://tools.ietf.org/html/rfc3339) timestamp). Read-only. |  |
| `creator` | `object` | The creator of the event. Read-only. |  |
| `creator.displayName` | `string` | The creator's name, if available. |  |
| `creator.email` | `string` | The creator's email address, if available. |  |
| `creator.id` | `string` | The creator's Profile ID, if available. |  |
| `creator.self` | `boolean` | Whether the creator corresponds to the calendar on which this copy of the event appears. Read-only. The default is False. |  |
| `description` | `string` | Description of the event. Can contain HTML. Optional. | writable |
| `end` | `nested object` | The (exclusive) end time of the event. For a recurring event, this is the end time of the first instance. |  |
| `end.date` | `date` | The date, in the format "yyyy-mm-dd", if this is an all-day event. | writable |
| `end.dateTime` | `datetime` | The time, as a combined date-time value (formatted according to [RFC3339](https://tools.ietf.org/html/rfc3339)). A time zone offset is required unless a time zone is explicitly specified in `timeZone`. | writable |
| `end.timeZone` | `string` | The time zone in which the time is specified. (Formatted as an IANA Time Zone Database name, e.g. "Europe/Zurich".) For recurring events this field is required and specifies the time zone in which the recurrence is expanded. For single events this field is optional and indicates a custom time zone for the event start/end. | writable |
| `endTimeUnspecified` | `boolean` | Whether the end time is actually unspecified. An end time is still provided for compatibility reasons, even if this attribute is set to True. The default is False. |  |
| `etag` | `etag` | ETag of the resource. |  |
| `eventType` | `string` | Specific type of the event. This cannot be modified after the event is created. Possible values are:  * "`birthday`" - A special all-day event with an annual recurrence. * "`default`" - A regular event or not further specified. * "`focusTime`" - A focus-time event. * "`fromGmail`" - An event from Gmail. This type of event cannot be created. * "`outOfOffice`" - An out-of-office event. * "`workingLocation`" - A working location event. | writable |
| `extendedProperties` | `object` | Extended properties of the event. |  |
| `extendedProperties.private` | `object` | Properties that are private to the copy of the event that appears on this calendar. | writable |
| `extendedProperties.private.(key)` | `string` | The name of the private property and the corresponding value. |  |
| `extendedProperties.shared` | `object` | Properties that are shared between copies of the event on other attendees' calendars. | writable |
| `extendedProperties.shared.(key)` | `string` | The name of the shared property and the corresponding value. |  |
| `focusTimeProperties` | `nested object` | Focus Time event data. Used if `eventType` is `focusTime`. | writable |
| `focusTimeProperties.autoDeclineMode` | `string` | Whether to decline meeting invitations which overlap Focus Time events. Valid values are `declineNone`, meaning that no meeting invitations are declined; `declineAllConflictingInvitations`, meaning that all conflicting meeting invitations that conflict with the event are declined; and `declineOnlyNewConflictingInvitations`, meaning that only new conflicting meeting invitations which arrive while the Focus Time event is present are to be declined. |  |
| `focusTimeProperties.chatStatus` | `string` | The status to mark the user in Chat and related products. This can be `available` or `doNotDisturb`. |  |
| `focusTimeProperties.declineMessage` | `string` | Response message to set if an existing event or new invitation is automatically declined by Calendar. |  |
| `gadget` | `object` | A gadget that extends this event. Gadgets are deprecated; this structure is instead only used for returning birthday calendar metadata. |  |
| `gadget.display` | `string` | The gadget's display mode. Deprecated. Possible values are:  * "`icon`" - The gadget displays next to the event's title in the calendar view. * "`chip`" - The gadget displays when the event is clicked. | writable |
| `gadget.height` | `integer` | The gadget's height in pixels. The height must be an integer greater than 0. Optional. Deprecated. | writable |
| `gadget.iconLink` | `string` | The gadget's icon URL. The URL scheme must be HTTPS. Deprecated. | writable |
| `gadget.link` | `string` | The gadget's URL. The URL scheme must be HTTPS. Deprecated. | writable |
| `gadget.preferences` | `object` | Preferences. | writable |
| `gadget.preferences.(key)` | `string` | The preference name and corresponding value. |  |
| `gadget.title` | `string` | The gadget's title. Deprecated. | writable |
| `gadget.type` | `string` | The gadget's type. Deprecated. | writable |
| `gadget.width` | `integer` | The gadget's width in pixels. The width must be an integer greater than 0. Optional. Deprecated. | writable |
| `guestsCanInviteOthers` | `boolean` | Whether attendees other than the organizer can invite others to the event. Optional. The default is True. | writable |
| `guestsCanModify` | `boolean` | Whether attendees other than the organizer can modify the event. Optional. The default is False. | writable |
| `guestsCanSeeOtherGuests` | `boolean` | Whether attendees other than the organizer can see who the event's attendees are. Optional. The default is True. | writable |
| `hangoutLink` | `string` | An absolute link to the Google Hangout associated with this event. Read-only. |  |
| `htmlLink` | `string` | An absolute link to this event in the Google Calendar Web UI. Read-only. |  |
| `iCalUID` | `string` | Event unique identifier as defined in [RFC5545](https://tools.ietf.org/html/rfc5545#section-3.8.4.7). It is used to uniquely identify events accross calendaring systems and must be supplied when importing events via the [import](/calendar/v3/reference/events/import) method. Note that the `iCalUID` and the `id` are not identical and only one of them should be supplied at event creation time. One difference in their semantics is that in recurring events, all occurrences of one event have different `id`s while they all share the same `iCalUID`s. To retrieve an event using its `iCalUID`, call the [events.list method using the `iCalUID` parameter](/calendar/v3/reference/events/list#iCalUID). To retrieve an event using its `id`, call the [events.get](/calendar/v3/reference/events/get) method. |  |
| `id` | `string` | Opaque identifier of the event. When creating new single or recurring events, you can specify their IDs. Provided IDs must follow these rules:  * characters allowed in the ID are those used in base32hex encoding, i.e. lowercase letters a-v and digits 0-9, see section 3.1.2 in [RFC2938](http://tools.ietf.org/html/rfc2938#section-3.1.2) * the length of the ID must be between 5 and 1024 characters * the ID must be unique per calendar  Due to the globally distributed nature of the system, we cannot guarantee that ID collisions will be detected at event creation time. To minimize the risk of collisions we recommend using an established UUID algorithm such as one described in [RFC4122](https://tools.ietf.org/html/rfc4122). If you do not specify an ID, it will be automatically generated by the server.  Note that the `icalUID` and the `id` are not identical and only one of them should be supplied at event creation time. One difference in their semantics is that in recurring events, all occurrences of one event have different `id`s while they all share the same `icalUID`s. | writable |
| `kind` | `string` | Type of the resource ("`calendar#event`"). |  |
| `location` | `string` | Geographic location of the event as free-form text. Optional. | writable |
| `locked` | `boolean` | Whether this is a locked event copy where no changes can be made to the main event fields "summary", "description", "location", "start", "end" or "recurrence". The default is False. Read-Only. |  |
| `organizer` | `object` | The organizer of the event. If the organizer is also an attendee, this is indicated with a separate entry in `attendees` with the `organizer` field set to True. To change the organizer, use the [move](/calendar/v3/reference/events/move) operation. Read-only, except when importing an event. | writable |
| `organizer.displayName` | `string` | The organizer's name, if available. | writable |
| `organizer.email` | `string` | The organizer's email address, if available. It must be a valid email address as per [RFC5322](https://tools.ietf.org/html/rfc5322#section-3.4). | writable |
| `organizer.id` | `string` | The organizer's Profile ID, if available. |  |
| `organizer.self` | `boolean` | Whether the organizer corresponds to the calendar on which this copy of the event appears. Read-only. The default is False. |  |
| `originalStartTime` | `nested object` | For an instance of a recurring event, this is the time at which this event would start according to the recurrence data in the recurring event identified by recurringEventId. It uniquely identifies the instance within the recurring event series even if the instance was moved to a different time. Immutable. |  |
| `originalStartTime.date` | `date` | The date, in the format "yyyy-mm-dd", if this is an all-day event. | writable |
| `originalStartTime.dateTime` | `datetime` | The time, as a combined date-time value (formatted according to [RFC3339](https://tools.ietf.org/html/rfc3339)). A time zone offset is required unless a time zone is explicitly specified in `timeZone`. | writable |
| `originalStartTime.timeZone` | `string` | The time zone in which the time is specified. (Formatted as an IANA Time Zone Database name, e.g. "Europe/Zurich".) For recurring events this field is required and specifies the time zone in which the recurrence is expanded. For single events this field is optional and indicates a custom time zone for the event start/end. | writable |
| `outOfOfficeProperties` | `nested object` | Out of office event data. Used if `eventType` is `outOfOffice`. | writable |
| `outOfOfficeProperties.autoDeclineMode` | `string` | Whether to decline meeting invitations which overlap Out of office events. Valid values are `declineNone`, meaning that no meeting invitations are declined; `declineAllConflictingInvitations`, meaning that all conflicting meeting invitations that conflict with the event are declined; and `declineOnlyNewConflictingInvitations`, meaning that only new conflicting meeting invitations which arrive while the Out of office event is present are to be declined. |  |
| `outOfOfficeProperties.declineMessage` | `string` | Response message to set if an existing event or new invitation is automatically declined by Calendar. |  |
| `privateCopy` | `boolean` | If set to True, [Event propagation](/calendar/concepts/sharing#event_propagation) is disabled. Note that it is not the same thing as [Private event properties](/calendar/concepts/sharing#private_event_properties). Optional. Immutable. The default is False. |  |
| `recurrence[]` | `list` | List of RRULE, EXRULE, RDATE and EXDATE lines for a recurring event, as specified in [RFC5545](http://tools.ietf.org/html/rfc5545#section-3.8.5). Note that DTSTART and DTEND lines are not allowed in this field; event start and end times are specified in the `start` and `end` fields. This field is omitted for single events or instances of recurring events. | writable |
| `recurringEventId` | `string` | For an instance of a recurring event, this is the `id` of the recurring event to which this instance belongs. Immutable. |  |
| `reminders` | `object` | Information about the event's reminders for the authenticated user. Note that changing reminders does not also change the `updated` property of the enclosing event. |  |
| `reminders.overrides[]` | `list` | If the event doesn't use the default reminders, this lists the reminders specific to the event, or, if not set, indicates that no reminders are set for this event. The maximum number of override reminders is 5. | writable |
| `reminders.overrides[].method` | `string` | The method used by this reminder. Possible values are:  * "`email`" - Reminders are sent via email. * "`popup`" - Reminders are sent via a UI popup.   Required when adding a reminder. | writable |
| `reminders.overrides[].minutes` | `integer` | Number of minutes before the start of the event when the reminder should trigger. Valid values are between 0 and 40320 (4 weeks in minutes). Required when adding a reminder. | writable |
| `reminders.useDefault` | `boolean` | Whether the default reminders of the calendar apply to the event. | writable |
| `sequence` | `integer` | Sequence number as per iCalendar. | writable |
| `source` | `object` | Source from which the event was created. For example, a web page, an email message or any document identifiable by an URL with HTTP or HTTPS scheme. Can only be seen or modified by the creator of the event. |  |
| `source.title` | `string` | Title of the source; for example a title of a web page or an email subject. | writable |
| `source.url` | `string` | URL of the source pointing to a resource. The URL scheme must be HTTP or HTTPS. | writable |
| `start` | `nested object` | The (inclusive) start time of the event. For a recurring event, this is the start time of the first instance. |  |
| `start.date` | `date` | The date, in the format "yyyy-mm-dd", if this is an all-day event. | writable |
| `start.dateTime` | `datetime` | The time, as a combined date-time value (formatted according to [RFC3339](https://tools.ietf.org/html/rfc3339)). A time zone offset is required unless a time zone is explicitly specified in `timeZone`. | writable |
| `start.timeZone` | `string` | The time zone in which the time is specified. (Formatted as an IANA Time Zone Database name, e.g. "Europe/Zurich".) For recurring events this field is required and specifies the time zone in which the recurrence is expanded. For single events this field is optional and indicates a custom time zone for the event start/end. | writable |
| `status` | `string` | Status of the event. Optional. Possible values are:  * "`confirmed`" - The event is confirmed. This is the default status. * "`tentative`" - The event is tentatively confirmed. * "`cancelled`" - The event is cancelled (deleted). The [list](/calendar/v3/reference/events/list) method returns cancelled events only on incremental sync (when `syncToken` or `updatedMin` are specified) or if the `showDeleted` flag is set to `true`. The [get](/calendar/v3/reference/events/get) method always returns them. A cancelled status represents two different states depending on the event type:    1. Cancelled exceptions of an uncancelled recurring event indicate that this instance should no longer be presented to the user. Clients should store these events for the lifetime of the parent recurring event. Cancelled exceptions are only guaranteed to have values for the `id`, `recurringEventId` and `originalStartTime` fields populated. The other fields might be empty.   2. All other cancelled events represent deleted events. Clients should remove their locally synced copies. Such cancelled events will eventually disappear, so do not rely on them being available indefinitely. Deleted events are only guaranteed to have the `id` field populated.On the organizer's calendar, cancelled events continue to expose event details (summary, location, etc.) so that they can be restored (undeleted). Similarly, the events to which the user was invited and that they manually removed continue to provide details. However, incremental sync requests with `showDeleted` set to false will not return these details. If an event changes its organizer (for example via the [move](/calendar/v3/reference/events/move) operation) and the original organizer is not on the attendee list, it will leave behind a cancelled event where only the `id` field is guaranteed to be populated. | writable |
| `summary` | `string` | Title of the event. | writable |
| `transparency` | `string` | Whether the event blocks time on the calendar. Optional. Possible values are:  * "`opaque`" - Default value. The event does block time on the calendar. This is equivalent to setting **Show me as** to **Busy** in the Calendar UI. * "`transparent`" - The event does not block time on the calendar. This is equivalent to setting **Show me as** to **Available** in the Calendar UI. | writable |
| `updated` | `datetime` | Last modification time of the main event data (as a [RFC3339](https://tools.ietf.org/html/rfc3339) timestamp). Updating event reminders will not cause this to change. Read-only. |  |
| `visibility` | `string` | Visibility of the event. Optional. Possible values are:  * "`default`" - Uses the default visibility for events on the calendar. This is the default value. * "`public`" - The event is public and event details are visible to all readers of the calendar. * "`private`" - The event is private and only event attendees may view event details. * "`confidential`" - The event is private. This value is provided for compatibility reasons. | writable |
| `workingLocationProperties` | `nested object` | Working location event data. | writable |
| `workingLocationProperties.customLocation` | `object` | If present, specifies that the user is working from a custom location. | writable |
| `workingLocationProperties.customLocation.label` | `string` | An optional extra label for additional information. | writable |
| `workingLocationProperties.homeOffice` | `any value` | If present, specifies that the user is working at home. | writable |
| `workingLocationProperties.officeLocation` | `object` | If present, specifies that the user is working from an office. | writable |
| `workingLocationProperties.officeLocation.buildingId` | `string` | An optional building identifier. This should reference a building ID in the organization's Resources database. | writable |
| `workingLocationProperties.officeLocation.deskId` | `string` | An optional desk identifier. | writable |
| `workingLocationProperties.officeLocation.floorId` | `string` | An optional floor identifier. | writable |
| `workingLocationProperties.officeLocation.floorSectionId` | `string` | An optional floor section identifier. | writable |
| `workingLocationProperties.officeLocation.label` | `string` | The office name that's displayed in Calendar Web and Mobile clients. We recommend you reference a building name in the organization's Resources database. | writable |
| `workingLocationProperties.type` | `string` | Type of the working location. Possible values are:  * "`homeOffice`" - The user is working at home. * "`officeLocation`" - The user is working from an office. * "`customLocation`" - The user is working from a custom location.  Any details are specified in a sub-field of the specified name, but this field may be missing if empty. Any other fields are ignored. Required when adding working location properties. | writable |

## Methods

[delete](/workspace/calendar/api/v3/reference/events/delete)
:   Deletes an event.

[get](/workspace/calendar/api/v3/reference/events/get)
:   Returns an event based on its Google Calendar ID. To retrieve an event using its iCalendar ID, call the [events.list method using the `iCalUID` parameter](/workspace/calendar/api/v3/reference/events/list#iCalUID).

[import](/workspace/calendar/api/v3/reference/events/import)
:   Imports an event. This operation is used to add a private copy of an existing event to a calendar. Only events with an `eventType` of `default` may be imported.

    **Deprecated behavior:** If a non-`default` event is imported, its type will be changed to `default` and any event-type-specific properties it may have will be dropped.

[insert](/workspace/calendar/api/v3/reference/events/insert)
:   Creates an event.

[instances](/workspace/calendar/api/v3/reference/events/instances)
:   Returns instances of the specified recurring event.

[list](/workspace/calendar/api/v3/reference/events/list)
:   Returns events on the specified calendar.

[move](/workspace/calendar/api/v3/reference/events/move)
:   Moves an event to another calendar, i.e. changes an event's organizer. Note that only `default` events can be moved; `birthday`, `focusTime`, `fromGmail`, `outOfOffice` and `workingLocation` events cannot be moved.

[patch](/workspace/calendar/api/v3/reference/events/patch)
:   Updates an event. This method supports patch semantics. Note that each patch request consumes three quota units; prefer using a `get` followed by an `update`. The field values you specify replace the existing values. Fields that you don't specify in the request remain unchanged. Array fields, if specified, overwrite the existing arrays; this discards any previous array elements.

[quickAdd](/workspace/calendar/api/v3/reference/events/quickAdd)
:   Creates an event based on a simple text string.

[update](/workspace/calendar/api/v3/reference/events/update)
:   Updates an event. This method does not support patch semantics and always updates the entire event resource. To do a partial update, perform a `get` followed by an `update` using etags to ensure atomicity.

[watch](/workspace/calendar/api/v3/reference/events/watch)
:   Watch for changes to Events resources.




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/api/v3/reference/calendarList/delete

Send feedback

# CalendarList: delete Stay organized with collections Save and categorize content based on your preferences.

**Note:**
Requires [authorization](#auth).

Removes a calendar from the user's calendar list.
[Try it now](#try-it).

## Request

### HTTP request

```
DELETE https://www.googleapis.com/calendar/v3/users/me/calendarList/calendarId
```

### Parameters

| Parameter name | Value | Description |
| --- | --- | --- |
| **Path parameters** | | |
| `calendarId` | `string` | Calendar identifier. To retrieve calendar IDs call the [calendarList.list](/workspace/calendar/api/v3/reference/calendarList/list) method. If you want to access the primary calendar of the currently logged in user, use the "`primary`" keyword. |

### Authorization

This request requires authorization with at least one of the following scopes:

| Scope |
| --- |
| `https://www.googleapis.com/auth/calendar` |
| `https://www.googleapis.com/auth/calendar.app.created` |
| `https://www.googleapis.com/auth/calendar.calendarlist` |

For more information, see the [authentication and authorization](/workspace/guides/configure-oauth-consent) page.

### Request body

Do not supply a request body with this method.

## Response

If successful, this method returns an empty response body.




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/api/v3/reference/events/get

Send feedback

# Events: get Stay organized with collections Save and categorize content based on your preferences.

**Note:**
[Authorization](#auth) optional.

Returns an event based on its Google Calendar ID. To retrieve an event using its iCalendar ID, call the [events.list method using the `iCalUID` parameter](/workspace/calendar/api/v3/reference/events/list#iCalUID).
[Try it now](#try-it).

## Request

### HTTP request

```
GET https://www.googleapis.com/calendar/v3/calendars/calendarId/events/eventId
```

### Parameters

| Parameter name | Value | Description |
| --- | --- | --- |
| **Path parameters** | | |
| `calendarId` | `string` | Calendar identifier. To retrieve calendar IDs call the [calendarList.list](/workspace/calendar/api/v3/reference/calendarList/list) method. If you want to access the primary calendar of the currently logged in user, use the "`primary`" keyword. |
| `eventId` | `string` | Event identifier. |
| **Optional query parameters** | | |
| `alwaysIncludeEmail` | `boolean` | Deprecated and ignored. A value will always be returned in the `email` field for the organizer, creator and attendees, even if no real email address is available (i.e. a generated, non-working value will be provided). |
| `maxAttendees` | `integer` | The maximum number of attendees to include in the response. If there are more than the specified number of attendees, only the participant is returned. Optional. |
| `timeZone` | `string` | Time zone used in the response. Optional. The default is the time zone of the calendar. |

### Authorization

This request allows authorization with at least one of the following scopes:

| Scope |
| --- |
| `https://www.googleapis.com/auth/calendar.readonly` |
| `https://www.googleapis.com/auth/calendar` |
| `https://www.googleapis.com/auth/calendar.events.readonly` |
| `https://www.googleapis.com/auth/calendar.events` |
| `https://www.googleapis.com/auth/calendar.app.created` |
| `https://www.googleapis.com/auth/calendar.events.freebusy` |
| `https://www.googleapis.com/auth/calendar.events.owned` |
| `https://www.googleapis.com/auth/calendar.events.owned.readonly` |
| `https://www.googleapis.com/auth/calendar.events.public.readonly` |

For more information, see the [authentication and authorization](/workspace/guides/configure-oauth-consent) page.

### Request body

Do not supply a request body with this method.

## Response

If successful, this method returns an [Events resource](/workspace/calendar/api/v3/reference/events#resource) in the response body.




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/api/v3/reference/events/insert

Send feedback

# Events: insert Stay organized with collections Save and categorize content based on your preferences.

**Note:**
Requires [authorization](#auth).

Creates an event.
[Try it now](#try-it).

## Request

### HTTP request

```
POST https://www.googleapis.com/calendar/v3/calendars/calendarId/events
```

### Parameters

| Parameter name | Value | Description |
| --- | --- | --- |
| **Path parameters** | | |
| `calendarId` | `string` | Calendar identifier. To retrieve calendar IDs call the [calendarList.list](/workspace/calendar/api/v3/reference/calendarList/list) method. If you want to access the primary calendar of the currently logged in user, use the "`primary`" keyword. |
| **Optional query parameters** | | |
| `conferenceDataVersion` | `integer` | Version number of conference data supported by the API client. Version 0 assumes no conference data support and ignores conference data in the event's body. Version 1 enables support for copying of ConferenceData as well as for creating new conferences using the createRequest field of conferenceData. The default is 0. Acceptable values are `0` to `1`, inclusive. |
| `maxAttendees` | `integer` | The maximum number of attendees to include in the response. If there are more than the specified number of attendees, only the participant is returned. Optional. |
| `sendNotifications` | `boolean` | Deprecated. Please use [sendUpdates](/workspace/calendar/api/v3/reference/events/insert#sendUpdates) instead.  Whether to send notifications about the creation of the new event. Note that some emails might still be sent even if you set the value to `false`. The default is `false`. |
| `sendUpdates` | `string` | Whether to send notifications about the creation of the new event. Note that some emails might still be sent. The default is `false`.   Acceptable values are:  * "`all`": Notifications are sent to all guests. * "`externalOnly`": Notifications are sent to non-Google Calendar guests only. * "`none`": No notifications are sent. **Warning:** Using the value `none` can have significant adverse effects, including events not syncing to external calendars or events being lost altogether for some users. For calendar migration tasks, consider using the [events.import](/workspace/calendar/api/v3/reference/events/import) method instead. |
| `supportsAttachments` | `boolean` | Whether API client performing operation supports event attachments. Optional. The default is False. |

### Authorization

This request requires authorization with at least one of the following scopes:

| Scope |
| --- |
| `https://www.googleapis.com/auth/calendar` |
| `https://www.googleapis.com/auth/calendar.events` |
| `https://www.googleapis.com/auth/calendar.app.created` |
| `https://www.googleapis.com/auth/calendar.events.owned` |

For more information, see the [authentication and authorization](/workspace/guides/configure-oauth-consent) page.

### Request body

In the request body, supply an [Events resource](/workspace/calendar/api/v3/reference/events#resource) with the following properties:

| Property name | Value | Description | Notes |
| --- | --- | --- | --- |
| **Required Properties** | | | |
| `end` | `nested object` | The (exclusive) end time of the event. For a recurring event, this is the end time of the first instance. |  |
| `start` | `nested object` | The (inclusive) start time of the event. For a recurring event, this is the start time of the first instance. |  |
| **Optional Properties** | | | |
| `anyoneCanAddSelf` | `boolean` | Whether anyone can invite themselves to the event (deprecated). Optional. The default is False. | writable |
| `attachments[].fileUrl` | `string` | URL link to the attachment. For adding Google Drive file attachments use the same format as in `alternateLink` property of the `Files` resource in the Drive API.  Required when adding an attachment. | writable |
| `attendees[]` | `list` | The attendees of the event. See the [Events with attendees](/calendar/concepts/sharing) guide for more information on scheduling events with other calendar users. Service accounts need to use [domain-wide delegation of authority](/calendar/auth#perform-g-suite-domain-wide-delegation-of-authority) to populate the attendee list. | writable |
| `attendees[].additionalGuests` | `integer` | Number of additional guests. Optional. The default is 0. | writable |
| `attendees[].comment` | `string` | The attendee's response comment. Optional. | writable |
| `attendees[].displayName` | `string` | The attendee's name, if available. Optional. | writable |
| `attendees[].email` | `string` | The attendee's email address, if available. This field must be present when adding an attendee. It must be a valid email address as per [RFC5322](https://tools.ietf.org/html/rfc5322#section-3.4). Required when adding an attendee. | writable |
| `attendees[].optional` | `boolean` | Whether this is an optional attendee. Optional. The default is False. | writable |
| `attendees[].resource` | `boolean` | Whether the attendee is a resource. Can only be set when the attendee is added to the event for the first time. Subsequent modifications are ignored. Optional. The default is False. | writable |
| `attendees[].responseStatus` | `string` | The attendee's response status. Possible values are:  * "`needsAction`" - The attendee has not responded to the invitation (recommended for new events). * "`declined`" - The attendee has declined the invitation. * "`tentative`" - The attendee has tentatively accepted the invitation. * "`accepted`" - The attendee has accepted the invitation.  **Warning:** If you add an event using the values `declined`, `tentative`, or `accepted`, attendees with the "Add invitations to my calendar" setting set to "When I respond to invitation in email" or "Only if the sender is known" might have their response reset to `needsAction` and won't see an event in their calendar unless they change their response in the event invitation email. Furthermore, if more than 200 guests are invited to the event, response status is not propagated to the guests. | writable |
| `birthdayProperties` | `nested object` | Birthday or special event data. Used if `eventType` is `"birthday"`. Immutable. | writable |
| `birthdayProperties.type` | `string` | Type of birthday or special event. Possible values are:  * `"anniversary"` - An anniversary other than birthday. Always has a `contact`. * `"birthday"` - A birthday event. This is the default value. * `"custom"` - A special date whose label is further specified in the `customTypeName` field. Always has a `contact`. * `"other"` - A special date which does not fall into the other categories, and does not have a custom label. Always has a `contact`. * `"self"` - Calendar owner's own birthday. Cannot have a `contact`.  The Calendar API only supports creating events with the type `"birthday"`. The type cannot be changed after the event is created. | writable |
| `colorId` | `string` | The color of the event. This is an ID referring to an entry in the `event` section of the colors definition (see the  [colors endpoint](/calendar/v3/reference/colors)). Optional. | writable |
| `conferenceData` | `nested object` | The conference-related information, such as details of a Google Meet conference. To create new conference details use the `createRequest` field. To persist your changes, remember to set the `conferenceDataVersion` request parameter to `1` for all event modification requests. **Warning:** Reusing Google Meet conference data across different events can cause access issues and expose meeting details to unintended users. To help ensure meeting privacy, always generate a unique conference for each event by using the `createRequest` field. | writable |
| `description` | `string` | Description of the event. Can contain HTML. Optional. | writable |
| `end.date` | `date` | The date, in the format "yyyy-mm-dd", if this is an all-day event. | writable |
| `end.dateTime` | `datetime` | The time, as a combined date-time value (formatted according to [RFC3339](https://tools.ietf.org/html/rfc3339)). A time zone offset is required unless a time zone is explicitly specified in `timeZone`. | writable |
| `end.timeZone` | `string` | The time zone in which the time is specified. (Formatted as an IANA Time Zone Database name, e.g. "Europe/Zurich".) For recurring events this field is required and specifies the time zone in which the recurrence is expanded. For single events this field is optional and indicates a custom time zone for the event start/end. | writable |
| `eventType` | `string` | Specific type of the event. This cannot be modified after the event is created. Possible values are:  * "`birthday`" - A special all-day event with an annual recurrence. * "`default`" - A regular event or not further specified. * "`focusTime`" - A focus-time event. * "`fromGmail`" - An event from Gmail. This type of event cannot be created. * "`outOfOffice`" - An out-of-office event. * "`workingLocation`" - A working location event. | writable |
| `extendedProperties.private` | `object` | Properties that are private to the copy of the event that appears on this calendar. | writable |
| `extendedProperties.shared` | `object` | Properties that are shared between copies of the event on other attendees' calendars. | writable |
| `focusTimeProperties` | `nested object` | Focus Time event data. Used if `eventType` is `focusTime`. | writable |
| `gadget.display` | `string` | The gadget's display mode. Deprecated. Possible values are:  * "`icon`" - The gadget displays next to the event's title in the calendar view. * "`chip`" - The gadget displays when the event is clicked. | writable |
| `gadget.height` | `integer` | The gadget's height in pixels. The height must be an integer greater than 0. Optional. Deprecated. | writable |
| `gadget.iconLink` | `string` | The gadget's icon URL. The URL scheme must be HTTPS. Deprecated. | writable |
| `gadget.link` | `string` | The gadget's URL. The URL scheme must be HTTPS. Deprecated. | writable |
| `gadget.preferences` | `object` | Preferences. | writable |
| `gadget.title` | `string` | The gadget's title. Deprecated. | writable |
| `gadget.type` | `string` | The gadget's type. Deprecated. | writable |
| `gadget.width` | `integer` | The gadget's width in pixels. The width must be an integer greater than 0. Optional. Deprecated. | writable |
| `guestsCanInviteOthers` | `boolean` | Whether attendees other than the organizer can invite others to the event. Optional. The default is True. | writable |
| `guestsCanModify` | `boolean` | Whether attendees other than the organizer can modify the event. Optional. The default is False. | writable |
| `guestsCanSeeOtherGuests` | `boolean` | Whether attendees other than the organizer can see who the event's attendees are. Optional. The default is True. | writable |
| `id` | `string` | Opaque identifier of the event. When creating new single or recurring events, you can specify their IDs. Provided IDs must follow these rules:  * characters allowed in the ID are those used in base32hex encoding, i.e. lowercase letters a-v and digits 0-9, see section 3.1.2 in [RFC2938](http://tools.ietf.org/html/rfc2938#section-3.1.2) * the length of the ID must be between 5 and 1024 characters * the ID must be unique per calendar  Due to the globally distributed nature of the system, we cannot guarantee that ID collisions will be detected at event creation time. To minimize the risk of collisions we recommend using an established UUID algorithm such as one described in [RFC4122](https://tools.ietf.org/html/rfc4122). If you do not specify an ID, it will be automatically generated by the server.  Note that the `icalUID` and the `id` are not identical and only one of them should be supplied at event creation time. One difference in their semantics is that in recurring events, all occurrences of one event have different `id`s while they all share the same `icalUID`s. | writable |
| `location` | `string` | Geographic location of the event as free-form text. Optional. | writable |
| `originalStartTime.date` | `date` | The date, in the format "yyyy-mm-dd", if this is an all-day event. | writable |
| `originalStartTime.dateTime` | `datetime` | The time, as a combined date-time value (formatted according to [RFC3339](https://tools.ietf.org/html/rfc3339)). A time zone offset is required unless a time zone is explicitly specified in `timeZone`. | writable |
| `originalStartTime.timeZone` | `string` | The time zone in which the time is specified. (Formatted as an IANA Time Zone Database name, e.g. "Europe/Zurich".) For recurring events this field is required and specifies the time zone in which the recurrence is expanded. For single events this field is optional and indicates a custom time zone for the event start/end. | writable |
| `outOfOfficeProperties` | `nested object` | Out of office event data. Used if `eventType` is `outOfOffice`. | writable |
| `recurrence[]` | `list` | List of RRULE, EXRULE, RDATE and EXDATE lines for a recurring event, as specified in [RFC5545](http://tools.ietf.org/html/rfc5545#section-3.8.5). Note that DTSTART and DTEND lines are not allowed in this field; event start and end times are specified in the `start` and `end` fields. This field is omitted for single events or instances of recurring events. | writable |
| `reminders.overrides[]` | `list` | If the event doesn't use the default reminders, this lists the reminders specific to the event, or, if not set, indicates that no reminders are set for this event. The maximum number of override reminders is 5. | writable |
| `reminders.overrides[].method` | `string` | The method used by this reminder. Possible values are:  * "`email`" - Reminders are sent via email. * "`popup`" - Reminders are sent via a UI popup.   Required when adding a reminder. | writable |
| `reminders.overrides[].minutes` | `integer` | Number of minutes before the start of the event when the reminder should trigger. Valid values are between 0 and 40320 (4 weeks in minutes). Required when adding a reminder. | writable |
| `reminders.useDefault` | `boolean` | Whether the default reminders of the calendar apply to the event. | writable |
| `sequence` | `integer` | Sequence number as per iCalendar. | writable |
| `source.title` | `string` | Title of the source; for example a title of a web page or an email subject. | writable |
| `source.url` | `string` | URL of the source pointing to a resource. The URL scheme must be HTTP or HTTPS. | writable |
| `start.date` | `date` | The date, in the format "yyyy-mm-dd", if this is an all-day event. | writable |
| `start.dateTime` | `datetime` | The time, as a combined date-time value (formatted according to [RFC3339](https://tools.ietf.org/html/rfc3339)). A time zone offset is required unless a time zone is explicitly specified in `timeZone`. | writable |
| `start.timeZone` | `string` | The time zone in which the time is specified. (Formatted as an IANA Time Zone Database name, e.g. "Europe/Zurich".) For recurring events this field is required and specifies the time zone in which the recurrence is expanded. For single events this field is optional and indicates a custom time zone for the event start/end. | writable |
| `status` | `string` | Status of the event. Optional. Possible values are:  * "`confirmed`" - The event is confirmed. This is the default status. * "`tentative`" - The event is tentatively confirmed. * "`cancelled`" - The event is cancelled (deleted). The [list](/calendar/v3/reference/events/list) method returns cancelled events only on incremental sync (when `syncToken` or `updatedMin` are specified) or if the `showDeleted` flag is set to `true`. The [get](/calendar/v3/reference/events/get) method always returns them. A cancelled status represents two different states depending on the event type:    1. Cancelled exceptions of an uncancelled recurring event indicate that this instance should no longer be presented to the user. Clients should store these events for the lifetime of the parent recurring event. Cancelled exceptions are only guaranteed to have values for the `id`, `recurringEventId` and `originalStartTime` fields populated. The other fields might be empty.   2. All other cancelled events represent deleted events. Clients should remove their locally synced copies. Such cancelled events will eventually disappear, so do not rely on them being available indefinitely. Deleted events are only guaranteed to have the `id` field populated.On the organizer's calendar, cancelled events continue to expose event details (summary, location, etc.) so that they can be restored (undeleted). Similarly, the events to which the user was invited and that they manually removed continue to provide details. However, incremental sync requests with `showDeleted` set to false will not return these details. If an event changes its organizer (for example via the [move](/calendar/v3/reference/events/move) operation) and the original organizer is not on the attendee list, it will leave behind a cancelled event where only the `id` field is guaranteed to be populated. | writable |
| `summary` | `string` | Title of the event. | writable |
| `transparency` | `string` | Whether the event blocks time on the calendar. Optional. Possible values are:  * "`opaque`" - Default value. The event does block time on the calendar. This is equivalent to setting **Show me as** to **Busy** in the Calendar UI. * "`transparent`" - The event does not block time on the calendar. This is equivalent to setting **Show me as** to **Available** in the Calendar UI. | writable |
| `visibility` | `string` | Visibility of the event. Optional. Possible values are:  * "`default`" - Uses the default visibility for events on the calendar. This is the default value. * "`public`" - The event is public and event details are visible to all readers of the calendar. * "`private`" - The event is private and only event attendees may view event details. * "`confidential`" - The event is private. This value is provided for compatibility reasons. | writable |
| `workingLocationProperties` | `nested object` | Working location event data. | writable |
| `workingLocationProperties.customLocation` | `object` | If present, specifies that the user is working from a custom location. | writable |
| `workingLocationProperties.customLocation.label` | `string` | An optional extra label for additional information. | writable |
| `workingLocationProperties.homeOffice` | `any value` | If present, specifies that the user is working at home. | writable |
| `workingLocationProperties.officeLocation` | `object` | If present, specifies that the user is working from an office. | writable |
| `workingLocationProperties.officeLocation.buildingId` | `string` | An optional building identifier. This should reference a building ID in the organization's Resources database. | writable |
| `workingLocationProperties.officeLocation.deskId` | `string` | An optional desk identifier. | writable |
| `workingLocationProperties.officeLocation.floorId` | `string` | An optional floor identifier. | writable |
| `workingLocationProperties.officeLocation.floorSectionId` | `string` | An optional floor section identifier. | writable |
| `workingLocationProperties.officeLocation.label` | `string` | The office name that's displayed in Calendar Web and Mobile clients. We recommend you reference a building name in the organization's Resources database. | writable |
| `workingLocationProperties.type` | `string` | Type of the working location. Possible values are:  * "`homeOffice`" - The user is working at home. * "`officeLocation`" - The user is working from an office. * "`customLocation`" - The user is working from a custom location.  Any details are specified in a sub-field of the specified name, but this field may be missing if empty. Any other fields are ignored. Required when adding working location properties. | writable |

## Response

If successful, this method returns an [Events resource](/workspace/calendar/api/v3/reference/events#resource) in the response body.




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/api/v3/reference/settings/list

Send feedback

# Settings: list Stay organized with collections Save and categorize content based on your preferences.

**Note:**
Requires [authorization](#auth).

Returns all user settings for the authenticated user.
[Try it now](#try-it).

## Request

### HTTP request

```
GET https://www.googleapis.com/calendar/v3/users/me/settings
```

### Parameters

| Parameter name | Value | Description |
| --- | --- | --- |
| **Optional query parameters** | | |
| `maxResults` | `integer` | Maximum number of entries returned on one result page. By default the value is 100 entries. The page size can never be larger than 250 entries. Optional. |
| `pageToken` | `string` | Token specifying which result page to return. Optional. |
| `syncToken` | `string` | Token obtained from the `nextSyncToken` field returned on the last page of results from the previous list request. It makes the result of this list request contain only entries that have changed since then.  If the `syncToken` expires, the server will respond with a 410 GONE response code and the client should clear its storage and perform a full synchronization without any `syncToken`.  [Learn more](/workspace/calendar/api/guides/sync) about incremental synchronization.  Optional. The default is to return all entries. |

### Authorization

This request requires authorization with at least one of the following scopes:

| Scope |
| --- |
| `https://www.googleapis.com/auth/calendar.readonly` |
| `https://www.googleapis.com/auth/calendar` |
| `https://www.googleapis.com/auth/calendar.settings.readonly` |

For more information, see the [authentication and authorization](/workspace/guides/configure-oauth-consent) page.

### Request body

Do not supply a request body with this method.

## Response

If successful, this method returns a response body with the following structure:

```
{
  "kind": "calendar#settings",
  "etag": etag,
  "nextPageToken": string,
  "nextSyncToken": string,
  "items": [
    settings Resource
  ]
}
```

| Property name | Value | Description | Notes |
| --- | --- | --- | --- |
| `kind` | `string` | Type of the collection ("`calendar#settings`"). |  |
| `etag` | `etag` | Etag of the collection. |  |
| `items[]` | `list` | List of user settings. |  |
| `nextPageToken` | `string` | Token used to access the next page of this result. Omitted if no further results are available, in which case `nextSyncToken` is provided. |  |
| `nextSyncToken` | `string` | Token used at a later point in time to retrieve only the entries that have changed since this result was returned. Omitted if further results are available, in which case `nextPageToken` is provided. |  |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/api/v3/reference/colors/get

Send feedback

# Colors: get Stay organized with collections Save and categorize content based on your preferences.

**Note:**
[Authorization](#auth) optional.

Returns the color definitions for calendars and events.
[Try it now](#try-it).

## Request

### HTTP request

```
GET https://www.googleapis.com/calendar/v3/colors
```

### Authorization

This request allows authorization with at least one of the following scopes:

| Scope |
| --- |
| `https://www.googleapis.com/auth/calendar` |
| `https://www.googleapis.com/auth/calendar.readonly` |
| `https://www.googleapis.com/auth/calendar.app.created` |
| `https://www.googleapis.com/auth/calendar.calendarlist` |
| `https://www.googleapis.com/auth/calendar.calendarlist.readonly` |
| `https://www.googleapis.com/auth/calendar.events.freebusy` |
| `https://www.googleapis.com/auth/calendar.events.owned` |
| `https://www.googleapis.com/auth/calendar.events.owned.readonly` |
| `https://www.googleapis.com/auth/calendar.events.public.readonly` |

For more information, see the [authentication and authorization](/workspace/guides/configure-oauth-consent) page.

### Request body

Do not supply a request body with this method.

## Response

If successful, this method returns a [Colors resource](/workspace/calendar/api/v3/reference/colors#resource) in the response body.




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/api/v3/reference/events/instances

Send feedback

# Events: instances Stay organized with collections Save and categorize content based on your preferences.

**Note:**
[Authorization](#auth) optional.

Returns instances of the specified recurring event.
[Try it now](#try-it).

## Request

### HTTP request

```
GET https://www.googleapis.com/calendar/v3/calendars/calendarId/events/eventId/instances
```

### Parameters

| Parameter name | Value | Description |
| --- | --- | --- |
| **Path parameters** | | |
| `calendarId` | `string` | Calendar identifier. To retrieve calendar IDs call the [calendarList.list](/workspace/calendar/api/v3/reference/calendarList/list) method. If you want to access the primary calendar of the currently logged in user, use the "`primary`" keyword. |
| `eventId` | `string` | Recurring event identifier. |
| **Optional query parameters** | | |
| `alwaysIncludeEmail` | `boolean` | Deprecated and ignored. A value will always be returned in the `email` field for the organizer, creator and attendees, even if no real email address is available (i.e. a generated, non-working value will be provided). |
| `maxAttendees` | `integer` | The maximum number of attendees to include in the response. If there are more than the specified number of attendees, only the participant is returned. Optional. |
| `maxResults` | `integer` | Maximum number of events returned on one result page. By default the value is 250 events. The page size can never be larger than 2500 events. Optional. |
| `originalStart` | `string` | The original start time of the instance in the result. Optional. |
| `pageToken` | `string` | Token specifying which result page to return. Optional. |
| `showDeleted` | `boolean` | Whether to include deleted events (with `status` equals "`cancelled`") in the result. Cancelled instances of recurring events will still be included if `singleEvents` is False. Optional. The default is False. |
| `timeMax` | `datetime` | Upper bound (exclusive) for an event's start time to filter by. Optional. The default is not to filter by start time. Must be an RFC3339 timestamp with mandatory time zone offset. |
| `timeMin` | `datetime` | Lower bound (inclusive) for an event's end time to filter by. Optional. The default is not to filter by end time. Must be an RFC3339 timestamp with mandatory time zone offset. |
| `timeZone` | `string` | Time zone used in the response. Optional. The default is the time zone of the calendar. |

### Authorization

This request allows authorization with at least one of the following scopes:

| Scope |
| --- |
| `https://www.googleapis.com/auth/calendar.readonly` |
| `https://www.googleapis.com/auth/calendar` |
| `https://www.googleapis.com/auth/calendar.events.readonly` |
| `https://www.googleapis.com/auth/calendar.events` |
| `https://www.googleapis.com/auth/calendar.app.created` |
| `https://www.googleapis.com/auth/calendar.events.freebusy` |
| `https://www.googleapis.com/auth/calendar.events.owned` |
| `https://www.googleapis.com/auth/calendar.events.owned.readonly` |
| `https://www.googleapis.com/auth/calendar.events.public.readonly` |

For more information, see the [authentication and authorization](/workspace/guides/configure-oauth-consent) page.

### Request body

Do not supply a request body with this method.

## Response

If successful, this method returns a response body with the following structure:

```
{
  "kind": "calendar#events",
  "etag": etag,
  "summary": string,
  "description": string,
  "updated": datetime,
  "timeZone": string,
  "accessRole": string,
  "defaultReminders": [
    {
      "method": string,
      "minutes": integer
    }
  ],
  "nextPageToken": string,
  "nextSyncToken": string,
  "items": [
    events Resource
  ]
}
```

| Property name | Value | Description | Notes |
| --- | --- | --- | --- |
| `kind` | `string` | Type of the collection ("`calendar#events`"). |  |
| `etag` | `etag` | ETag of the collection. |  |
| `summary` | `string` | Title of the calendar. Read-only. |  |
| `description` | `string` | Description of the calendar. Read-only. |  |
| `updated` | `datetime` | Last modification time of the calendar (as a [RFC3339](https://tools.ietf.org/html/rfc3339) timestamp). Read-only. |  |
| `timeZone` | `string` | The time zone of the calendar. Read-only. |  |
| `accessRole` | `string` | The user's access role for this calendar. Read-only. Possible values are:  * "`none`" - The user has no access. * "`freeBusyReader`" - The user has read access to free/busy information. * "`reader`" - The user has read access to the calendar. Private events will appear to users with reader access, but event details will be hidden. * "`writer`" - The user has read and write access to the calendar. Private events will appear to users with writer access, and event details will be visible. * "`owner`" - The user has manager access to the calendar. This role has all of the permissions of the writer role with the additional ability to see and modify access levels of other users.  Important: the `owner` role is different from the calendar's data owner. A calendar has a single data owner, but can have multiple users with `owner` role. |  |
| `defaultReminders[]` | `list` | The default reminders on the calendar for the authenticated user. These reminders apply to all events on this calendar that do not explicitly override them (i.e. do not have `reminders.useDefault` set to True). |  |
| `defaultReminders[].method` | `string` | The method used by this reminder. Possible values are:  * "`email`" - Reminders are sent via email. * "`popup`" - Reminders are sent via a UI popup.   Required when adding a reminder. | writable |
| `defaultReminders[].minutes` | `integer` | Number of minutes before the start of the event when the reminder should trigger. Valid values are between 0 and 40320 (4 weeks in minutes). Required when adding a reminder. | writable |
| `nextPageToken` | `string` | Token used to access the next page of this result. Omitted if no further results are available, in which case `nextSyncToken` is provided. |  |
| `items[]` | `list` | List of events on the calendar. |  |
| `nextSyncToken` | `string` | Token used at a later point in time to retrieve only the entries that have changed since this result was returned. Omitted if further results are available, in which case `nextPageToken` is provided. |  |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/api/v3/reference/events/move

Send feedback

# Events: move Stay organized with collections Save and categorize content based on your preferences.

**Note:**
Requires [authorization](#auth).

Moves an event to another calendar, i.e. changes an event's organizer. Note that only `default` events can be moved; `birthday`, `focusTime`, `fromGmail`, `outOfOffice` and `workingLocation` events cannot be moved.
[Try it now](#try-it).

## Request

### HTTP request

```
POST https://www.googleapis.com/calendar/v3/calendars/calendarId/events/eventId/move
```

### Parameters

| Parameter name | Value | Description |
| --- | --- | --- |
| **Path parameters** | | |
| `calendarId` | `string` | Calendar identifier of the source calendar where the event currently is on. |
| `eventId` | `string` | Event identifier. |
| **Required query parameters** | | |
| `destination` | `string` | Calendar identifier of the target calendar where the event is to be moved to. |
| **Optional query parameters** | | |
| `sendNotifications` | `boolean` | Deprecated. Please use [sendUpdates](/workspace/calendar/api/v3/reference/events/move#sendUpdates) instead.  Whether to send notifications about the change of the event's organizer. Note that some emails might still be sent even if you set the value to `false`. The default is `false`. |
| `sendUpdates` | `string` | Guests who should receive notifications about the change of the event's organizer.   Acceptable values are:  * "`all`": Notifications are sent to all guests. * "`externalOnly`": Notifications are sent to non-Google Calendar guests only. * "`none`": No notifications are sent. For calendar migration tasks, consider using the [Events.import](/workspace/calendar/api/v3/reference/events/import) method instead. |

### Authorization

This request requires authorization with at least one of the following scopes:

| Scope |
| --- |
| `https://www.googleapis.com/auth/calendar` |
| `https://www.googleapis.com/auth/calendar.events` |
| `https://www.googleapis.com/auth/calendar.events.owned` |

For more information, see the [authentication and authorization](/workspace/guides/configure-oauth-consent) page.

### Request body

Do not supply a request body with this method.

## Response

If successful, this method returns an [Events resource](/workspace/calendar/api/v3/reference/events#resource) in the response body.




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/api/v3/reference/calendars/update

Send feedback

# Calendars: update Stay organized with collections Save and categorize content based on your preferences.

**Note:**
Requires [authorization](#auth).

Updates metadata for a calendar.
[Try it now](#try-it).

## Request

### HTTP request

```
PUT https://www.googleapis.com/calendar/v3/calendars/calendarId
```

### Parameters

| Parameter name | Value | Description |
| --- | --- | --- |
| **Path parameters** | | |
| `calendarId` | `string` | Calendar identifier. To retrieve calendar IDs call the [calendarList.list](/workspace/calendar/api/v3/reference/calendarList/list) method. If you want to access the primary calendar of the currently logged in user, use the "`primary`" keyword. |

### Authorization

This request requires authorization with at least one of the following scopes:

| Scope |
| --- |
| `https://www.googleapis.com/auth/calendar` |
| `https://www.googleapis.com/auth/calendar.app.created` |
| `https://www.googleapis.com/auth/calendar.calendars` |

For more information, see the [authentication and authorization](/workspace/guides/configure-oauth-consent) page.

### Request body

In the request body, supply a [Calendars resource](/workspace/calendar/api/v3/reference/calendars#resource) with the following properties:

| Property name | Value | Description | Notes |
| --- | --- | --- | --- |
| **Optional Properties** | | | |
| `description` | `string` | Description of the calendar. Optional. | writable |
| `location` | `string` | Geographic location of the calendar as free-form text. Optional. | writable |
| `summary` | `string` | Title of the calendar. | writable |
| `timeZone` | `string` | The time zone of the calendar. (Formatted as an IANA Time Zone Database name, e.g. "Europe/Zurich".) Optional. | writable |

## Response

If successful, this method returns a [Calendars resource](/workspace/calendar/api/v3/reference/calendars#resource) in the response body.




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/concepts/events-calendars

Send feedback

# Calendars & events Stay organized with collections Save and categorize content based on your preferences.

This guide describes calendars, events, and their relationship to each other.

## Calendars

A [calendar](/workspace/calendar/v3/reference/calendars#resource-representations)
is a collection of related events, along with additional metadata
such as summary, default time zone, location, etc. Each calendar is identified
by an ID, which is an email address. Calendars can be shared with others.
Primary calendars are owned by their associated user account, other calendars are
owned by a single data owner.

## Events

An [event](/workspace/calendar/v3/reference/events#resource-representations)
is an object associated with a specific date or time range. Events are identified by a unique ID. Besides a start and
end date-time, events contain other data such as summary, description,
location, status, reminders, attachments, etc.

### Types of events

Google Calendar supports *single* and *recurring* events:

* A *single* event represents a unique occurrence.
* A *recurring* event defines multiple occurrences.

Events may also be *timed* or *all-day*:

* A *timed* event occurs between two specific points in time. Timed events
  use the `start.dateTime` and `end.dateTime` fields to specify when they
  occur.
* An *all-day* event spans an entire day or consecutive series of days. All-day
  events use the `start.date` and `end.date` fields to specify when they occur.
  Note that the timezone field has no significance for all-day events.

The start and end of the event must both be timed or both
be all-day. For example, it is **not valid** to specify
`start.date` and `end.dateTime`.

### Organizers

Events have a single *organizer* which is the calendar containing the main copy
of the event. Events can also have multiple
[attendees](/workspace/calendar/concepts/sharing#inviting_attendees_to_events).
An attendee is usually the primary calendar of an invited user.

The following diagram shows the conceptual relationship between calendars,
events, and other related elements:

## Primary calendars & other calendars

A *primary* calendar is a special type of calendar associated with a single
user account. This calendar is created automatically for each new user account
and its ID usually matches the user's primary email address. As long as the
account exists, its primary calendar can never be deleted or "un-owned" by the
user. However, it can still be shared with other users.

In addition to the primary calendar, you can explicitly create any number of
other calendars. These calendars can be modified, deleted, and shared with
others. Such calendars have a single data owner with the highest privileges,
including the exclusive right to delete the calendar. The data owner's access
level cannot be downgraded. The data owner is initially determined as the user
who created the calendar, however the data ownership can be transferred in the
Google Calendar UI.

**Important:** When creating a calendar, we
recommend that your app authenticate as the intended data owner of the calendar. You can
use [domain-wide
delegation of authority](/workspace/cloud-search/docs/guides/delegation) to allow applications to act on behalf of a specific
user. Don't use a service account for authentication. If you use a service account
for authentication, the service account is the data owner, which can lead to
unexpected behavior. For example, if a service account is the data owner, data
ownership cannot be transferred.

## Calendar & calendar list

The [Calendars](/workspace/calendar/v3/reference/calendars) collection
represents all existing calendars. It can be used to create and delete
calendars. You can also retrieve or set global properties shared across all
users with access to a calendar. For example, a calendar's title and default
time zone are global properties.

The [CalendarList](/workspace/calendar/v3/reference/calendarList) is a
collection of all calendar entries that a user has added to their list (shown
in the left panel of the web UI). You can use it to add and remove existing
calendars to/from the users’ list. You also use it to retrieve and set the
values of user-specific calendar properties, such as default reminders. Another
example is foreground color, since different users can have different colors
set for the same calendar.

**Note:** The data owner of a calendar cannot remove this calendar from their
calendar list.

The following table compares the meaning of operations for the two collections:

| Operation | Calendars | CalendarList |
| --- | --- | --- |
| `insert` | Creates a new secondary calendar. This calendar is also added to the creator's calendar list, and cannot be removed, unless the calendar is deleted or transferred. | Inserts an existing calendar into the user's list. |
| `delete` | Deletes a secondary calendar. | Removes a calendar from the user's list. |
| `get` | Retrieves calendar metadata e.g. title, time zone. | Retrieves metadata **plus** user-specific customization such as color or override reminders. |
| `patch`/`update` | Modifies calendar metadata. | Modifies user-specific calendar properties. |

## Recurring events

Some events occur multiple times on a regular schedule, such as weekly meetings,
birthdays, and holidays. Other than having different start and end times,
these repeated events are often identical.

Events are called *recurring* if they repeat according to a defined schedule.
*Single* events are non-recurring and happen only once.

### Recurrence rule

The schedule for a recurring event is defined in two parts:

* Its start and end fields (which define the first occurrence, as if this were
  just a stand-alone single event), and
* Its recurrence field (which defines how the event should be repeated over time).

The recurrence field contains an array of strings representing one or several
`RRULE`, `RDATE` or `EXDATE` properties as defined in [RFC
5545](http://tools.ietf.org/html/rfc5545).

The `RRULE` property is the most important as it defines a regular rule for
repeating the event. It is composed of several components. Some of them are:

* `FREQ` — The frequency with which the event should be repeated (such as
  `DAILY` or `WEEKLY`). Required.
* `INTERVAL` — Works together with `FREQ` to specify how often the event
  should be repeated. For example, `FREQ=DAILY;INTERVAL=2` means once every
  two days.
* `COUNT` — Number of times this event should be repeated.

  You can use either COUNT or UNTIL to specify the end
  of the event recurrence. Don't use both in the same rule.
* `UNTIL` — The date or date-time until which the event should be repeated (inclusive).
* `BYDAY` — Days of the week on which the event should be repeated (`SU`,
  `MO`, `TU`, etc.). Other similar components include `BYMONTH`, `BYYEARDAY`, and
  `BYHOUR`.

The `RDATE` property specifies additional dates or date-times when the event
occurrences should happen. For example, `RDATE;VALUE=DATE:19970101,19970120`.
Use this to add extra occurrences not covered by the `RRULE`.

The `EXDATE` property is similar to RDATE, but specifies dates or date-times
when the event should *not* happen. That is, those occurrences should be
excluded. This must point to a valid instance generated by the recurrence rule.

`EXDATE` and `RDATE` can have a time zone, and must be dates (not date-times)
for all-day events.

Each of the properties may occur within the recurrence field multiple times.
The recurrence is defined as the union of all `RRULE` and `RDATE` rules, minus the
ones excluded by all `EXDATE` rules.

Here are some examples of recurrent events:

1. An event that happens from 6am until 7am every Tuesday and Friday starting
   from September 15th, 2015 and stopping after the fifth occurrence on September 29th:

   ```
   ...
   "start": {
    "dateTime": "2015-09-15T06:00:00+02:00",
    "timeZone": "Europe/Zurich"
   },
   "end": {
    "dateTime": "2015-09-15T07:00:00+02:00",
    "timeZone": "Europe/Zurich"
   },
   "recurrence": [
    "RRULE:FREQ=WEEKLY;COUNT=5;BYDAY=TU,FR"
   ],
   …
   ```
2. An all-day event starting on June 1st, 2015 and repeating every 3 days
   throughout the month, excluding June 10th but including June 9th and 11th:

   ```
   ...
   "start": {
    "date": "2015-06-01"
   },
   "end": {
    "date": "2015-06-02"
   },
   "recurrence": [
    "EXDATE;VALUE=DATE:20150610",
    "RDATE;VALUE=DATE:20150609,20150611",
    "RRULE:FREQ=DAILY;UNTIL=20150628;INTERVAL=3"
   ],
   …
   ```

### Instances & exceptions

A recurring event consists of several *instances*: its particular occurrences
at different times. These instances act as events themselves.

Recurring event modifications can either affect the whole
recurring event (and all of its instances), or only individual instances.
Instances that differ from their parent recurring event are called *exceptions*.

For example, an exception may have a different summary, a different start time,
or additional attendees invited only to that instance. You can also cancel an
instance altogether without removing the recurring event
(instance cancellations are reflected in the event
[`status`](/workspace/calendar/v3/reference/events#status)).

Examples of how to work with recurring events and instances via the
Google Calendar API can be found [here](/workspace/calendar/recurringevents).

## Time zones

A time zone specifies a region that observes a uniform standard time.
In the Google Calendar API, you specify time zones using
[IANA time zone](http://www.iana.org/time-zones) identifiers.

You can set the time zone for both calendars and events. The following sections
describe the effects of these settings.

### Calendar time zone

The time zone of the calendar is also known as the *default time zone* because of
its implications for query results. The calendar time zone affects the way
time values are interpreted or presented by the
[`events.get()`](/workspace/calendar/v3/reference/events/get),
[`events.list()`](/workspace/calendar/v3/reference/events/list), and
[`events.instances()`](/workspace/calendar/v3/reference/events/instances) methods.

Query result time-zone conversion
:   Results of the
    [`get()`](/workspace/calendar/v3/reference/events/get),
    [`list()`](/workspace/calendar/v3/reference/events/list), and
    [`instances()`](/workspace/calendar/v3/reference/events/instances)
    methods are returned in the time zone that you specify in the `timeZone`
    parameter. If you omit this parameter, then these methods all use the calendar
    time zone as the default.

Matching all-day events to time-bracketed queries
:   The
    [`list()`](/workspace/calendar/v3/reference/events/list), and
    [`instances()`](/workspace/calendar/v3/reference/events/instances)
    methods let you specify start- and end-time filters, with the method
    returning instances that fall in the specified range. The calendar time zone
    is used to calculate start and end times of all-day events to determine
    whether they fall within the filter specification.

### Event time zone

Event instances have a start and end time; the specification for these times
may include the time zone. You can specify the time zone in several ways; the
following all specify the same time:

* Include a time zone offset in the `dateTime` field, for example `2017-01-25T09:00:00-0500`.
* Specify the time with no offset, for example `2017-01-25T09:00:00`, leaving the `timeZone` field empty (this implicitly uses the default time zone).
* Specify the time with no offset, for example `2017-01-25T09:00:00`, but use the `timeZone` field to specify the time zone.

You can also specify event times in UTC if you prefer:

* Specify the time in UTC: `2017-01-25T14:00:00Z` or use a zero offset `2017-01-25T14:00:00+0000`.

The internal representation of the event time is the same in all these cases,
but setting the `timeZone` field attaches a time zone to the event, just as
when you [set an event time zone using the Calendar
UI](https://support.google.com/calendar/answer/37064?ref_topic=6272668):

For single events, you can specify different time zones for
an event's start and end times. (This can help with events—such as travel—that
actually start and end in different time zones.) For recurring events,
see below.

### Recurring event time zone

For recurring events a single timezone must always be specified.
It is needed in order to expand the recurrences of the event.




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar

Send feedback

### Enhance the Google Calendar experience

Insert interactive content, powered by your account data or an external service, with **add-ons**.

* Show contextual details from a third-party system when users view or create events.
* Show your custom conferencing solution when users create an event.

[View documentation](https://developers.google.com/workspace/add-ons/calendar)
[Learn about add-ons](https://developers.google.com/workspace/add-ons)

### Automate Google Calendar with simple code

Anyone can use **Apps Script** to automate and enhance Google Calendar in a web-based, low-code environment.

* Create events based on Google Form submissions.
* Update events or calendars from Google Sheets.
* Insert calendar data into Google Sheets for review.

[View documentation](https://developers.google.com/apps-script/reference/calendar)
[Learn about Apps Script](https://developers.google.com/apps-script)

### Build AI-powered Google Calendar solutions

Discover and try Google Calendar samples that help you get started with building AI features using AI models, agents, platforms, and more.

smart\_toy

### Travel Concierge agent

Build an AI agent add-on that integrates with ADK and Vertex AI Agent Engine.

[Open tutorial](https://developers.google.com/workspace/add-ons/samples/travel-concierge)

smart\_toy

### All samples

Explore add-on samples by featured Google products, language, sample type, and type.

[Explore catalog](https://developers.google.com/workspace/add-ons/samples?product=googlecalendar)

### Connect your service to Google Calendar

Use the REST APIs below to interact programmatically with Google Calendar.

### [Calendar API](https://developers.google.com/workspace/calendar/api)

**Read and update calendars** with several popular programming languages, such as Java, JavaScript, and Python.

[View documentation](https://developers.google.com/workspace/calendar/api)
[Try it out](https://developers.google.com/workspace/calendar/api/v3/reference/calendars/get?apix_params=%7B"calendarId"%3A"primary"%7D)

### [CalDAV API](https://developers.google.com/workspace/calendar/caldav)

**Use Google's CalDAV server** to read and update calendar data.

[View documentation](https://developers.google.com/workspace/calendar/caldav)

---
# https://developers.google.com/workspace/calendar/api/v3/reference/acl/update

Send feedback

# Acl: update Stay organized with collections Save and categorize content based on your preferences.

**Note:**
Requires [authorization](#auth).

Updates an access control rule.
[Try it now](#try-it).

## Request

### HTTP request

```
PUT https://www.googleapis.com/calendar/v3/calendars/calendarId/acl/ruleId
```

### Parameters

| Parameter name | Value | Description |
| --- | --- | --- |
| **Path parameters** | | |
| `calendarId` | `string` | Calendar identifier. To retrieve calendar IDs call the [calendarList.list](/workspace/calendar/api/v3/reference/calendarList/list) method. If you want to access the primary calendar of the currently logged in user, use the "`primary`" keyword. |
| `ruleId` | `string` | ACL rule identifier. |
| **Optional query parameters** | | |
| `sendNotifications` | `boolean` | Whether to send notifications about the calendar sharing change. Note that there are no notifications on access removal. Optional. The default is True. |

### Authorization

This request requires authorization with at least one of the following scopes:

| Scope |
| --- |
| `https://www.googleapis.com/auth/calendar` |
| `https://www.googleapis.com/auth/calendar.acls` |

For more information, see the [authentication and authorization](/workspace/guides/configure-oauth-consent) page.

### Request body

In the request body, supply an [Acl resource](/workspace/calendar/api/v3/reference/acl#resource) with the following properties:

| Property name | Value | Description | Notes |
| --- | --- | --- | --- |
| **Required Properties** | | | |
| `scope` | `object` | The extent to which [calendar access](https://developers.google.com/workspace/calendar/concepts/sharing#sharing_calendars) is granted by this ACL rule. |  |
| `scope.type` | `string` | The type of the scope. Possible values are:  * "`default`" - The public scope. This is the default value. * "`user`" - Limits the scope to a single user. * "`group`" - Limits the scope to a group. * "`domain`" - Limits the scope to a domain.  Note: The permissions granted to the "`default`", or public, scope apply to any user, authenticated or not. |  |
| **Optional Properties** | | | |
| `role` | `string` | The role assigned to the scope. Possible values are:  * "`none`" - Provides no access. * "`freeBusyReader`" - Provides read access to free/busy information. * "`reader`" - Provides read access to the calendar. Private events will appear to users with reader access, but event details will be hidden. * "`writer`" - Provides read and write access to the calendar. Private events will appear to users with writer access, and event details will be visible. Provides read access to the calendar's ACLs. * "`owner`" - Provides manager access to the calendar. This role has all of the permissions of the writer role with the additional ability to modify access levels of other users.  Important: the `owner` role is different from the calendar's data owner. A calendar has a single data owner, but can have multiple users with `owner` role. | writable |
| `scope.value` | `string` | The email address of a user or group, or the name of a domain, depending on the scope type. Omitted for type "`default`". | writable |

## Response

If successful, this method returns an [Acl resource](/workspace/calendar/api/v3/reference/acl#resource) in the response body.




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/create-events

Send feedback

# Create events Stay organized with collections Save and categorize content based on your preferences.

Imagine an app that helps users find the best hiking routes. By adding the
hiking plan as a calendar event, the users get a lot of help in staying
organized automatically. Google Calendar helps them to share the plan and
reminds them about it so they can get prepared with no stress. Also, thanks to
seamless integration of Google products, Google Now pings them about the time to
leave and Google Maps direct them to the meeting spot on time.

This article explains how to create calendar events and add them to your users'
calendars.

## Add an event

To create an event, call the
[`events.insert()`](/workspace/calendar/v3/reference/events/insert) method providing at
least these parameters:

* `calendarId` is the calendar identifier and can either be the email address
  of the calendar on which to create the event or a special keyword
  `'primary'` which will use the primary calendar of the logged in user. If
  you don't know the email address of the calendar you would like to use, you
  can check it either in the calendar's settings of the Google Calendar web
  UI (in the section "Calendar Address") or you can look for it
  in the result of the
  [`calendarList.list()`](/workspace/calendar/v3/reference/calendarList/list) call.
* `event` is the event to create with all the necessary details such as start
  and end. The only two required fields are the `start` and `end` times. See the
  [`event` reference](/workspace/calendar/v3/reference/events) for the full set of event
  fields.
  Specify timed events using the `start.dateTime`
  and `end.dateTime` fields. For all-day events, use
  `start.date` and `end.date` instead.

In order to successfully create events, you need to:

* Set your OAuth scope to `https://www.googleapis.com/auth/calendar` so that
  you have edit access to the user's calendar.
* Ensure the authenticated user has write access to the calendar with the
  `calendarId` you provided (for example by calling
  [`calendarList.get()`](/workspace/calendar/v3/reference/calendarList/get) for the
  `calendarId` and checking the `accessRole`).

### Add event metadata

You can optionally add event metadata when you create a calendar event. If you
choose not to add metadata during creation, you can update many fields using the
[`events.update()`](/workspace/calendar/v3/reference/events/update); however, some fields,
such as the event ID, can only be set during an
[`events.insert()`](/workspace/calendar/v3/reference/events/insert) operation.

Location
:   Adding an address into the location field enables features such as
    "time to leave" or displaying a map with the directions.

Event ID
:   When creating an event, you can choose to generate your own event ID
    that conforms to our format requirements. This enables you to keep entities
    in your local database in sync with events in Google Calendar. It also
    prevents duplicate event creation if the operation fails at some point after
    it is successfully executed in the Calendar backend. If no
    event ID is provided, the server generates one for you. See the [event ID
    reference](/workspace/calendar/v3/reference/events#id) for more information.

Attendees
:   The event you create appears on all the primary Google Calendars of
    the attendees you included with the same event ID. If you set
    `sendUpdates` to `"all"` or `"externalOnly"` in your insert request,
    the corresponding attendees receive an email notification for your event. To
    learn more, see
    [events with multiple attendees](/workspace/calendar/concepts#events_with_attendees).

The following examples demonstrate creating an event and setting its metadata:

[Go](#go)[Java](#java)[JavaScript](#javascript)[Node.js](#node.js)[PHP](#php)[Python](#python)[Ruby](#ruby)
More

```
// Refer to the Go quickstart on how to setup the environment:
// https://developers.google.com/workspace/calendar/quickstart/go
// Change the scope to calendar.CalendarScope and delete any stored credentials.

event := &calendar.Event{
  Summary: "Google I/O 2015",
  Location: "800 Howard St., San Francisco, CA 94103",
  Description: "A chance to hear more about Google's developer products.",
  Start: &calendar.EventDateTime{
    DateTime: "2015-05-28T09:00:00-07:00",
    TimeZone: "America/Los_Angeles",
  },
  End: &calendar.EventDateTime{
    DateTime: "2015-05-28T17:00:00-07:00",
    TimeZone: "America/Los_Angeles",
  },
  Recurrence: []string{"RRULE:FREQ=DAILY;COUNT=2"},
  Attendees: []*calendar.EventAttendee{
    &calendar.EventAttendee{Email:"lpage@example.com"},
    &calendar.EventAttendee{Email:"sbrin@example.com"},
  },
}

calendarId := "primary"
event, err = srv.Events.Insert(calendarId, event).Do()
if err != nil {
  log.Fatalf("Unable to create event. %v\n", err)
}
fmt.Printf("Event created: %s\n", event.HtmlLink)
```

```
// Refer to the Java quickstart on how to setup the environment:
// https://developers.google.com/workspace/calendar/quickstart/java
// Change the scope to CalendarScopes.CALENDAR and delete any stored
// credentials.

Event event = new Event()
    .setSummary("Google I/O 2015")
    .setLocation("800 Howard St., San Francisco, CA 94103")
    .setDescription("A chance to hear more about Google's developer products.");

DateTime startDateTime = new DateTime("2015-05-28T09:00:00-07:00");
EventDateTime start = new EventDateTime()
    .setDateTime(startDateTime)
    .setTimeZone("America/Los_Angeles");
event.setStart(start);

DateTime endDateTime = new DateTime("2015-05-28T17:00:00-07:00");
EventDateTime end = new EventDateTime()
    .setDateTime(endDateTime)
    .setTimeZone("America/Los_Angeles");
event.setEnd(end);

String[] recurrence = new String[] {"RRULE:FREQ=DAILY;COUNT=2"};
event.setRecurrence(Arrays.asList(recurrence));

EventAttendee[] attendees = new EventAttendee[] {
    new EventAttendee().setEmail("lpage@example.com"),
    new EventAttendee().setEmail("sbrin@example.com"),
};
event.setAttendees(Arrays.asList(attendees));

EventReminder[] reminderOverrides = new EventReminder[] {
    new EventReminder().setMethod("email").setMinutes(24 * 60),
    new EventReminder().setMethod("popup").setMinutes(10),
};
Event.Reminders reminders = new Event.Reminders()
    .setUseDefault(false)
    .setOverrides(Arrays.asList(reminderOverrides));
event.setReminders(reminders);

String calendarId = "primary";
event = service.events().insert(calendarId, event).execute();
System.out.printf("Event created: %s\n", event.getHtmlLink());
```

```
// Refer to the JavaScript quickstart on how to setup the environment:
// https://developers.google.com/workspace/calendar/quickstart/js
// Change the scope to 'https://www.googleapis.com/auth/calendar' and delete any
// stored credentials.

const event = {
  'summary': 'Google I/O 2015',
  'location': '800 Howard St., San Francisco, CA 94103',
  'description': 'A chance to hear more about Google\'s developer products.',
  'start': {
    'dateTime': '2015-05-28T09:00:00-07:00',
    'timeZone': 'America/Los_Angeles'
  },
  'end': {
    'dateTime': '2015-05-28T17:00:00-07:00',
    'timeZone': 'America/Los_Angeles'
  },
  'recurrence': [
    'RRULE:FREQ=DAILY;COUNT=2'
  ],
  'attendees': [
    {'email': 'lpage@example.com'},
    {'email': 'sbrin@example.com'}
  ],
  'reminders': {
    'useDefault': false,
    'overrides': [
      {'method': 'email', 'minutes': 24 * 60},
      {'method': 'popup', 'minutes': 10}
    ]
  }
};

const request = gapi.client.calendar.events.insert({
  'calendarId': 'primary',
  'resource': event
});

request.execute(function(event) {
  appendPre('Event created: ' + event.htmlLink);
});
```

```
// Refer to the Node.js quickstart on how to setup the environment:
// https://developers.google.com/workspace/calendar/quickstart/node
// Change the scope to 'https://www.googleapis.com/auth/calendar' and delete any
// stored credentials.

const event = {
  'summary': 'Google I/O 2015',
  'location': '800 Howard St., San Francisco, CA 94103',
  'description': 'A chance to hear more about Google\'s developer products.',
  'start': {
    'dateTime': '2015-05-28T09:00:00-07:00',
    'timeZone': 'America/Los_Angeles',
  },
  'end': {
    'dateTime': '2015-05-28T17:00:00-07:00',
    'timeZone': 'America/Los_Angeles',
  },
  'recurrence': [
    'RRULE:FREQ=DAILY;COUNT=2'
  ],
  'attendees': [
    {'email': 'lpage@example.com'},
    {'email': 'sbrin@example.com'},
  ],
  'reminders': {
    'useDefault': false,
    'overrides': [
      {'method': 'email', 'minutes': 24 * 60},
      {'method': 'popup', 'minutes': 10},
    ],
  },
};

calendar.events.insert({
  auth: auth,
  calendarId: 'primary',
  resource: event,
}, function(err, event) {
  if (err) {
    console.log('There was an error contacting the Calendar service: ' + err);
    return;
  }
  console.log('Event created: %s', event.htmlLink);
});
```

```
$event = new Google_Service_Calendar_Event(array(
  'summary' => 'Google I/O 2015',
  'location' => '800 Howard St., San Francisco, CA 94103',
  'description' => 'A chance to hear more about Google\'s developer products.',
  'start' => array(
    'dateTime' => '2015-05-28T09:00:00-07:00',
    'timeZone' => 'America/Los_Angeles',
  ),
  'end' => array(
    'dateTime' => '2015-05-28T17:00:00-07:00',
    'timeZone' => 'America/Los_Angeles',
  ),
  'recurrence' => array(
    'RRULE:FREQ=DAILY;COUNT=2'
  ),
  'attendees' => array(
    array('email' => 'lpage@example.com'),
    array('email' => 'sbrin@example.com'),
  ),
  'reminders' => array(
    'useDefault' => FALSE,
    'overrides' => array(
      array('method' => 'email', 'minutes' => 24 * 60),
      array('method' => 'popup', 'minutes' => 10),
    ),
  ),
));

$calendarId = 'primary';
$event = $service->events->insert($calendarId, $event);
printf('Event created: %s\n', $event->htmlLink);
```

```
# Refer to the Python quickstart on how to setup the environment:
# https://developers.google.com/workspace/calendar/quickstart/python
# Change the scope to 'https://www.googleapis.com/auth/calendar' and delete any
# stored credentials.

event = {
  'summary': 'Google I/O 2015',
  'location': '800 Howard St., San Francisco, CA 94103',
  'description': 'A chance to hear more about Google\'s developer products.',
  'start': {
    'dateTime': '2015-05-28T09:00:00-07:00',
    'timeZone': 'America/Los_Angeles',
  },
  'end': {
    'dateTime': '2015-05-28T17:00:00-07:00',
    'timeZone': 'America/Los_Angeles',
  },
  'recurrence': [
    'RRULE:FREQ=DAILY;COUNT=2'
  ],
  'attendees': [
    {'email': 'lpage@example.com'},
    {'email': 'sbrin@example.com'},
  ],
  'reminders': {
    'useDefault': False,
    'overrides': [
      {'method': 'email', 'minutes': 24 * 60},
      {'method': 'popup', 'minutes': 10},
    ],
  },
}

event = service.events().insert(calendarId='primary', body=event).execute()
print 'Event created: %s' % (event.get('htmlLink'))
```

```
event = Google::Apis::CalendarV3::Event.new(
  summary: 'Google I/O 2015',
  location: '800 Howard St., San Francisco, CA 94103',
  description: 'A chance to hear more about Google\'s developer products.',
  start: Google::Apis::CalendarV3::EventDateTime.new(
    date_time: '2015-05-28T09:00:00-07:00',
    time_zone: 'America/Los_Angeles'
  ),
  end: Google::Apis::CalendarV3::EventDateTime.new(
    date_time: '2015-05-28T17:00:00-07:00',
    time_zone: 'America/Los_Angeles'
  ),
  recurrence: [
    'RRULE:FREQ=DAILY;COUNT=2'
  ],
  attendees: [
    Google::Apis::CalendarV3::EventAttendee.new(
      email: 'lpage@example.com'
    ),
    Google::Apis::CalendarV3::EventAttendee.new(
      email: 'sbrin@example.com'
    )
  ],
  reminders: Google::Apis::CalendarV3::Event::Reminders.new(
    use_default: false,
    overrides: [
      Google::Apis::CalendarV3::EventReminder.new(
        reminder_method: 'email',
        minutes: 24 * 60
      ),
      Google::Apis::CalendarV3::EventReminder.new(
        reminder_method: 'popup',
        minutes: 10
      )
    ]
  )
)

result = client.insert_event('primary', event)
puts "Event created: #{result.html_link}"
```

### Add Drive attachments to events

You can attach [Google Drive](//drive.google.com)
files such as meeting notes in Docs, budgets in
Sheets, presentations in Slides, or any other
relevant Google Drive files to your calendar events. You can add the
attachment when you create an event with
[`events.insert()`](/workspace/calendar/v3/reference/events/insert) or later as part of an
update such as with [`events.patch()`](/workspace/calendar/v3/reference/events/patch)

The two parts of attaching a Google Drive file to an event are:

1. Get the file `alternateLink` URL, `title`, and `mimeType` from the [Drive API Files resource](/workspace/drive/v3/reference/files),
   typically with the [`files.get()`](/workspace/drive/v3/reference/files/get)
   method.
2. Create or update an event with the `attachments` fields set in the request
   body and the `supportsAttachments` parameter set to `true`.

The following code example demonstrates how to update an existing event to add
an attachment:

[Java](#java)[PHP](#php)[Python](#python)
More

```
public static void addAttachment(Calendar calendarService, Drive driveService, String calendarId,
    String eventId, String fileId) throws IOException {
  File file = driveService.files().get(fileId).execute();
  Event event = calendarService.events().get(calendarId, eventId).execute();

  List<EventAttachment> attachments = event.getAttachments();
  if (attachments == null) {
    attachments = new ArrayList<EventAttachment>();
  }
  attachments.add(new EventAttachment()
      .setFileUrl(file.getAlternateLink())
      .setMimeType(file.getMimeType())
      .setTitle(file.getTitle()));

  Event changes = new Event()
      .setAttachments(attachments);
  calendarService.events().patch(calendarId, eventId, changes)
      .setSupportsAttachments(true)
      .execute();
}
```

```
function addAttachment($calendarService, $driveService, $calendarId, $eventId, $fileId) {
  $file = $driveService->files->get($fileId);
  $event = $calendarService->events->get($calendarId, $eventId);
  $attachments = $event->attachments;

  $attachments[] = array(
    'fileUrl' => $file->alternateLink,
    'mimeType' => $file->mimeType,
    'title' => $file->title
  );
  $changes = new Google_Service_Calendar_Event(array(
    'attachments' => $attachments
  ));

  $calendarService->events->patch($calendarId, $eventId, $changes, array(
    'supportsAttachments' => TRUE
  ));
}
```

```
def add_attachment(calendarService, driveService, calendarId, eventId, fileId):
    file = driveService.files().get(fileId=fileId).execute()
    event = calendarService.events().get(calendarId=calendarId,
                                         eventId=eventId).execute()

    attachments = event.get('attachments', [])
    attachments.append({
        'fileUrl': file['alternateLink'],
        'mimeType': file['mimeType'],
        'title': file['title']
    })

    changes = {
        'attachments': attachments
    }
    calendarService.events().patch(calendarId=calendarId, eventId=eventId,
                                   body=changes,
                                   supportsAttachments=True).execute()
```

**Important:** You must perform a [full sync](/workspace/calendar/v3/sync#initial_full_sync)
of all events before enabling the `supportsAttachments` parameter for event
modifications when adding attachments support into your existing app that stores
events locally. If you do not perform a sync first, you may inadvertently remove
existing attachments from user's events.

### Add video and phone conferences to events

You can associate events with
[Hangouts](//hangouts.google.com) and
[Google Meet](//meet.google.com) conferences to
allow your users to meet remotely via a phone call or a video call.

The [`conferenceData`](/workspace/calendar/v3/reference/events#conferenceData) field can
be used to read, copy, and clear existing conference details; it can also be
used to request generation of new conferences. To allow creation and
modification of conference details, set the `conferenceDataVersion` request
parameter to `1`.

There are three types of `conferenceData` currently supported, as denoted by the
`conferenceData.conferenceSolution.key.type`:

1. Hangouts for consumers (`eventHangout`)
2. Classic Hangouts for Google Workspace users
   (deprecated; `eventNamedHangout`)
3. Google Meet (`hangoutsMeet`)

You can learn which conference type is supported for any given calendar of a
user by looking at the `conferenceProperties.allowedConferenceSolutionTypes` in
the [`calendars`](/workspace/calendar/v3/reference/calendars) and
[`calendarList`](/workspace/calendar/v3/reference/calendarList) collections. You can also
learn whether the user prefers to have Hangouts created for all their newly
created events by checking the `autoAddHangouts` setting in the
[`settings`](/workspace/calendar/v3/reference/settings) collection.

Besides the `type`, the `conferenceSolution` also provides the `name` and the
`iconUri` fields that you can use to represent the conference solution as shown
below:

[JavaScript](#javascript)
More

```
const solution = event.conferenceData.conferenceSolution;

const content = document.getElementById("content");
const text = document.createTextNode("Join " + solution.name);
const icon = document.createElement("img");
icon.src = solution.iconUri;

content.appendChild(icon);
content.appendChild(text);
```

You can create a new conference for an event by providing a `createRequest` with
a newly generated `requestId` which can be a random `string`. Conferences are
created asynchronously, but you can always check the status of your request to
let your users know what’s happening.

For example, to request conference generation for an existing event:

[JavaScript](#javascript)
More

```
const eventPatch = {
  conferenceData: {
    createRequest: {requestId: "7qxalsvy0e"}
  }
};

gapi.client.calendar.events.patch({
  calendarId: "primary",
  eventId: "7cbh8rpc10lrc0ckih9tafss99",
  resource: eventPatch,
  sendUpdates: "all",
  conferenceDataVersion: 1
}).execute(function(event) {
  console.log("Conference created for event: %s", event.htmlLink);
});
```

The immediate response to this call might not yet contain the fully-populated
`conferenceData`; this is indicated by a status code of `pending` in the
[status](/workspace/calendar/v3/reference/events#conferenceData.createRequest.status)
field. The status code changes to `success` after the conference information is
populated. The `entryPoints` field contains information about which video and
phone URIs are available for your users to dial in.

If you wish to schedule multiple Calendar events with the same
conference details, you can copy the entire `conferenceData` from one event to
another.

Copying is useful in certain situations. For example, suppose you are developing
a recruiting application that sets up separate events for the candidate and the
interviewer—you want to protect the interviewer’s identity, but you also
want to make sure all participants join the same conference call.

**Important:** You must perform a [full sync](/workspace/calendar/v3/sync#initial_full_sync)
of all events before enabling the conference data support (by setting of the
`conferenceDataVersion` request parameter to `1` for event modifications) when
adding conference support into your existing app that stores events locally. If
you do not perform a sync first, you may inadvertently remove existing
conferences from users' events.




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/v3/pagination

Send feedback

# Page through lists of resources Stay organized with collections Save and categorize content based on your preferences.

You can control the maximum number of resources the server returns in the
response to a list request by setting the `maxResults` field. Furthermore,
for some collections (such as Events) there is a hard limit on the number of
retrieved entries that the server will never exceed. If the total number of
events exceeds this maximum, the server returns one page of results.

Remember that `maxResults` does not guarantee the number of results on one page.
Incomplete results can be detected by a non-empty `nextPageToken` field in
the result. In order to retrieve the next page, perform the exact same request
as previously and append a `pageToken` field with the value of
`nextPageToken` from the previous page. A new `nextPageToken` is provided
on the following pages until all the results are retrieved.

For example, here is a query followed by the query for retrieving the
next page of results in a paginated list:

```
GET /calendars/primary/events?maxResults=10&singleEvents=true

//Result contains

"nextPageToken":"CiAKGjBpNDd2Nmp2Zml2cXRwYjBpOXA",
```

The subsequent query takes the value from `nextPageToken` and
submits it as the value for `pageToken`:

```
GET /calendars/primary/events?maxResults=10&singleEvents=true&pageToken=CiAKGjBpNDd2Nmp2Zml2cXRwYjBpOXA
```




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/v3/reference/events/update

Send feedback

# Events: update Stay organized with collections Save and categorize content based on your preferences.

**Note:**
Requires [authorization](#auth).

Updates an event. This method does not support patch semantics and always updates the entire event resource. To do a partial update, perform a `get` followed by an `update` using etags to ensure atomicity.
[Try it now](#try-it).

## Request

### HTTP request

```
PUT https://www.googleapis.com/calendar/v3/calendars/calendarId/events/eventId
```

### Parameters

| Parameter name | Value | Description |
| --- | --- | --- |
| **Path parameters** | | |
| `calendarId` | `string` | Calendar identifier. To retrieve calendar IDs call the [calendarList.list](/workspace/calendar/api/v3/reference/calendarList/list) method. If you want to access the primary calendar of the currently logged in user, use the "`primary`" keyword. |
| `eventId` | `string` | Event identifier. |
| **Optional query parameters** | | |
| `alwaysIncludeEmail` | `boolean` | Deprecated and ignored. A value will always be returned in the `email` field for the organizer, creator and attendees, even if no real email address is available (i.e. a generated, non-working value will be provided). |
| `conferenceDataVersion` | `integer` | Version number of conference data supported by the API client. Version 0 assumes no conference data support and ignores conference data in the event's body. Version 1 enables support for copying of ConferenceData as well as for creating new conferences using the createRequest field of conferenceData. The default is 0. Acceptable values are `0` to `1`, inclusive. |
| `maxAttendees` | `integer` | The maximum number of attendees to include in the response. If there are more than the specified number of attendees, only the participant is returned. Optional. |
| `sendNotifications` | `boolean` | Deprecated. Please use [sendUpdates](/workspace/calendar/api/v3/reference/events/update#sendUpdates) instead.  Whether to send notifications about the event update (for example, description changes, etc.). Note that some emails might still be sent even if you set the value to `false`. The default is `false`. |
| `sendUpdates` | `string` | Guests who should receive notifications about the event update (for example, title changes, etc.).   Acceptable values are:  * "`all`": Notifications are sent to all guests. * "`externalOnly`": Notifications are sent to non-Google Calendar guests only. * "`none`": No notifications are sent. For calendar migration tasks, consider using the [Events.import](/workspace/calendar/api/v3/reference/events/import) method instead. |
| `supportsAttachments` | `boolean` | Whether API client performing operation supports event attachments. Optional. The default is False. |

### Authorization

This request requires authorization with at least one of the following scopes:

| Scope |
| --- |
| `https://www.googleapis.com/auth/calendar` |
| `https://www.googleapis.com/auth/calendar.events` |
| `https://www.googleapis.com/auth/calendar.app.created` |
| `https://www.googleapis.com/auth/calendar.events.owned` |

For more information, see the [authentication and authorization](/workspace/guides/configure-oauth-consent) page.

### Request body

In the request body, supply an [Events resource](/workspace/calendar/api/v3/reference/events#resource) with the following properties:

| Property name | Value | Description | Notes |
| --- | --- | --- | --- |
| **Required Properties** | | | |
| `end` | `nested object` | The (exclusive) end time of the event. For a recurring event, this is the end time of the first instance. |  |
| `start` | `nested object` | The (inclusive) start time of the event. For a recurring event, this is the start time of the first instance. |  |
| **Optional Properties** | | | |
| `anyoneCanAddSelf` | `boolean` | Whether anyone can invite themselves to the event (deprecated). Optional. The default is False. | writable |
| `attachments[].fileUrl` | `string` | URL link to the attachment. For adding Google Drive file attachments use the same format as in `alternateLink` property of the `Files` resource in the Drive API.  Required when adding an attachment. | writable |
| `attendees[]` | `list` | The attendees of the event. See the [Events with attendees](/calendar/concepts/sharing) guide for more information on scheduling events with other calendar users. Service accounts need to use [domain-wide delegation of authority](/calendar/auth#perform-g-suite-domain-wide-delegation-of-authority) to populate the attendee list. | writable |
| `attendees[].additionalGuests` | `integer` | Number of additional guests. Optional. The default is 0. | writable |
| `attendees[].comment` | `string` | The attendee's response comment. Optional. | writable |
| `attendees[].displayName` | `string` | The attendee's name, if available. Optional. | writable |
| `attendees[].email` | `string` | The attendee's email address, if available. This field must be present when adding an attendee. It must be a valid email address as per [RFC5322](https://tools.ietf.org/html/rfc5322#section-3.4). Required when adding an attendee. | writable |
| `attendees[].optional` | `boolean` | Whether this is an optional attendee. Optional. The default is False. | writable |
| `attendees[].resource` | `boolean` | Whether the attendee is a resource. Can only be set when the attendee is added to the event for the first time. Subsequent modifications are ignored. Optional. The default is False. | writable |
| `attendees[].responseStatus` | `string` | The attendee's response status. Possible values are:  * "`needsAction`" - The attendee has not responded to the invitation (recommended for new events). * "`declined`" - The attendee has declined the invitation. * "`tentative`" - The attendee has tentatively accepted the invitation. * "`accepted`" - The attendee has accepted the invitation.  **Warning:** If you add an event using the values `declined`, `tentative`, or `accepted`, attendees with the "Add invitations to my calendar" setting set to "When I respond to invitation in email" or "Only if the sender is known" might have their response reset to `needsAction` and won't see an event in their calendar unless they change their response in the event invitation email. Furthermore, if more than 200 guests are invited to the event, response status is not propagated to the guests. | writable |
| `attendeesOmitted` | `boolean` | Whether attendees may have been omitted from the event's representation. When retrieving an event, this may be due to a restriction specified by the `maxAttendee` query parameter. When updating an event, this can be used to only update the participant's response. Optional. The default is False. | writable |
| `colorId` | `string` | The color of the event. This is an ID referring to an entry in the `event` section of the colors definition (see the  [colors endpoint](/calendar/v3/reference/colors)). Optional. | writable |
| `conferenceData` | `nested object` | The conference-related information, such as details of a Google Meet conference. To create new conference details use the `createRequest` field. To persist your changes, remember to set the `conferenceDataVersion` request parameter to `1` for all event modification requests. **Warning:** Reusing Google Meet conference data across different events can cause access issues and expose meeting details to unintended users. To help ensure meeting privacy, always generate a unique conference for each event by using the `createRequest` field. | writable |
| `description` | `string` | Description of the event. Can contain HTML. Optional. | writable |
| `end.date` | `date` | The date, in the format "yyyy-mm-dd", if this is an all-day event. | writable |
| `end.dateTime` | `datetime` | The time, as a combined date-time value (formatted according to [RFC3339](https://tools.ietf.org/html/rfc3339)). A time zone offset is required unless a time zone is explicitly specified in `timeZone`. | writable |
| `end.timeZone` | `string` | The time zone in which the time is specified. (Formatted as an IANA Time Zone Database name, e.g. "Europe/Zurich".) For recurring events this field is required and specifies the time zone in which the recurrence is expanded. For single events this field is optional and indicates a custom time zone for the event start/end. | writable |
| `extendedProperties.private` | `object` | Properties that are private to the copy of the event that appears on this calendar. | writable |
| `extendedProperties.shared` | `object` | Properties that are shared between copies of the event on other attendees' calendars. | writable |
| `focusTimeProperties` | `nested object` | Focus Time event data. Used if `eventType` is `focusTime`. | writable |
| `gadget.display` | `string` | The gadget's display mode. Deprecated. Possible values are:  * "`icon`" - The gadget displays next to the event's title in the calendar view. * "`chip`" - The gadget displays when the event is clicked. | writable |
| `gadget.height` | `integer` | The gadget's height in pixels. The height must be an integer greater than 0. Optional. Deprecated. | writable |
| `gadget.iconLink` | `string` | The gadget's icon URL. The URL scheme must be HTTPS. Deprecated. | writable |
| `gadget.link` | `string` | The gadget's URL. The URL scheme must be HTTPS. Deprecated. | writable |
| `gadget.preferences` | `object` | Preferences. | writable |
| `gadget.title` | `string` | The gadget's title. Deprecated. | writable |
| `gadget.type` | `string` | The gadget's type. Deprecated. | writable |
| `gadget.width` | `integer` | The gadget's width in pixels. The width must be an integer greater than 0. Optional. Deprecated. | writable |
| `guestsCanInviteOthers` | `boolean` | Whether attendees other than the organizer can invite others to the event. Optional. The default is True. | writable |
| `guestsCanModify` | `boolean` | Whether attendees other than the organizer can modify the event. Optional. The default is False. | writable |
| `guestsCanSeeOtherGuests` | `boolean` | Whether attendees other than the organizer can see who the event's attendees are. Optional. The default is True. | writable |
| `location` | `string` | Geographic location of the event as free-form text. Optional. | writable |
| `originalStartTime.date` | `date` | The date, in the format "yyyy-mm-dd", if this is an all-day event. | writable |
| `originalStartTime.dateTime` | `datetime` | The time, as a combined date-time value (formatted according to [RFC3339](https://tools.ietf.org/html/rfc3339)). A time zone offset is required unless a time zone is explicitly specified in `timeZone`. | writable |
| `originalStartTime.timeZone` | `string` | The time zone in which the time is specified. (Formatted as an IANA Time Zone Database name, e.g. "Europe/Zurich".) For recurring events this field is required and specifies the time zone in which the recurrence is expanded. For single events this field is optional and indicates a custom time zone for the event start/end. | writable |
| `outOfOfficeProperties` | `nested object` | Out of office event data. Used if `eventType` is `outOfOffice`. | writable |
| `recurrence[]` | `list` | List of RRULE, EXRULE, RDATE and EXDATE lines for a recurring event, as specified in [RFC5545](http://tools.ietf.org/html/rfc5545#section-3.8.5). Note that DTSTART and DTEND lines are not allowed in this field; event start and end times are specified in the `start` and `end` fields. This field is omitted for single events or instances of recurring events. | writable |
| `reminders.overrides[]` | `list` | If the event doesn't use the default reminders, this lists the reminders specific to the event, or, if not set, indicates that no reminders are set for this event. The maximum number of override reminders is 5. | writable |
| `reminders.overrides[].method` | `string` | The method used by this reminder. Possible values are:  * "`email`" - Reminders are sent via email. * "`popup`" - Reminders are sent via a UI popup.   Required when adding a reminder. | writable |
| `reminders.overrides[].minutes` | `integer` | Number of minutes before the start of the event when the reminder should trigger. Valid values are between 0 and 40320 (4 weeks in minutes). Required when adding a reminder. | writable |
| `reminders.useDefault` | `boolean` | Whether the default reminders of the calendar apply to the event. | writable |
| `sequence` | `integer` | Sequence number as per iCalendar. | writable |
| `source.title` | `string` | Title of the source; for example a title of a web page or an email subject. | writable |
| `source.url` | `string` | URL of the source pointing to a resource. The URL scheme must be HTTP or HTTPS. | writable |
| `start.date` | `date` | The date, in the format "yyyy-mm-dd", if this is an all-day event. | writable |
| `start.dateTime` | `datetime` | The time, as a combined date-time value (formatted according to [RFC3339](https://tools.ietf.org/html/rfc3339)). A time zone offset is required unless a time zone is explicitly specified in `timeZone`. | writable |
| `start.timeZone` | `string` | The time zone in which the time is specified. (Formatted as an IANA Time Zone Database name, e.g. "Europe/Zurich".) For recurring events this field is required and specifies the time zone in which the recurrence is expanded. For single events this field is optional and indicates a custom time zone for the event start/end. | writable |
| `status` | `string` | Status of the event. Optional. Possible values are:  * "`confirmed`" - The event is confirmed. This is the default status. * "`tentative`" - The event is tentatively confirmed. * "`cancelled`" - The event is cancelled (deleted). The [list](/calendar/v3/reference/events/list) method returns cancelled events only on incremental sync (when `syncToken` or `updatedMin` are specified) or if the `showDeleted` flag is set to `true`. The [get](/calendar/v3/reference/events/get) method always returns them. A cancelled status represents two different states depending on the event type:    1. Cancelled exceptions of an uncancelled recurring event indicate that this instance should no longer be presented to the user. Clients should store these events for the lifetime of the parent recurring event. Cancelled exceptions are only guaranteed to have values for the `id`, `recurringEventId` and `originalStartTime` fields populated. The other fields might be empty.   2. All other cancelled events represent deleted events. Clients should remove their locally synced copies. Such cancelled events will eventually disappear, so do not rely on them being available indefinitely. Deleted events are only guaranteed to have the `id` field populated.On the organizer's calendar, cancelled events continue to expose event details (summary, location, etc.) so that they can be restored (undeleted). Similarly, the events to which the user was invited and that they manually removed continue to provide details. However, incremental sync requests with `showDeleted` set to false will not return these details. If an event changes its organizer (for example via the [move](/calendar/v3/reference/events/move) operation) and the original organizer is not on the attendee list, it will leave behind a cancelled event where only the `id` field is guaranteed to be populated. | writable |
| `summary` | `string` | Title of the event. | writable |
| `transparency` | `string` | Whether the event blocks time on the calendar. Optional. Possible values are:  * "`opaque`" - Default value. The event does block time on the calendar. This is equivalent to setting **Show me as** to **Busy** in the Calendar UI. * "`transparent`" - The event does not block time on the calendar. This is equivalent to setting **Show me as** to **Available** in the Calendar UI. | writable |
| `visibility` | `string` | Visibility of the event. Optional. Possible values are:  * "`default`" - Uses the default visibility for events on the calendar. This is the default value. * "`public`" - The event is public and event details are visible to all readers of the calendar. * "`private`" - The event is private and only event attendees may view event details. * "`confidential`" - The event is private. This value is provided for compatibility reasons. | writable |
| `workingLocationProperties` | `nested object` | Working location event data. | writable |
| `workingLocationProperties.customLocation` | `object` | If present, specifies that the user is working from a custom location. | writable |
| `workingLocationProperties.customLocation.label` | `string` | An optional extra label for additional information. | writable |
| `workingLocationProperties.homeOffice` | `any value` | If present, specifies that the user is working at home. | writable |
| `workingLocationProperties.officeLocation` | `object` | If present, specifies that the user is working from an office. | writable |
| `workingLocationProperties.officeLocation.buildingId` | `string` | An optional building identifier. This should reference a building ID in the organization's Resources database. | writable |
| `workingLocationProperties.officeLocation.deskId` | `string` | An optional desk identifier. | writable |
| `workingLocationProperties.officeLocation.floorId` | `string` | An optional floor identifier. | writable |
| `workingLocationProperties.officeLocation.floorSectionId` | `string` | An optional floor section identifier. | writable |
| `workingLocationProperties.officeLocation.label` | `string` | The office name that's displayed in Calendar Web and Mobile clients. We recommend you reference a building name in the organization's Resources database. | writable |
| `workingLocationProperties.type` | `string` | Type of the working location. Possible values are:  * "`homeOffice`" - The user is working at home. * "`officeLocation`" - The user is working from an office. * "`customLocation`" - The user is working from a custom location.  Any details are specified in a sub-field of the specified name, but this field may be missing if empty. Any other fields are ignored. Required when adding working location properties. | writable |

## Response

If successful, this method returns an [Events resource](/workspace/calendar/api/v3/reference/events#resource) in the response body.




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/api/v3/reference/channels/stop

Send feedback

# Channels: stop Stay organized with collections Save and categorize content based on your preferences.

Stop watching resources through this channel.

## Request

### HTTP request

```
POST https://www.googleapis.com/calendar/v3/channels/stop
```

### Request body

In the request body, supply data with the following structure:

```
{
  "id": string,
  "resourceId": string
}
```

| Property name | Value | Description | Notes |
| --- | --- | --- | --- |
| `id` | `string` | A UUID or similar unique string that identifies this channel. |  |
| `resourceId` | `string` | An opaque ID that identifies the resource being watched on this channel. Stable across different API versions. |  |
| `token` | `string` | An arbitrary string delivered to the target address with each notification delivered over this channel. Optional. |  |

## Response

If successful, this method returns an empty response body.




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/api/v3/reference/acl/get

Send feedback

# Acl: get Stay organized with collections Save and categorize content based on your preferences.

**Note:**
Requires [authorization](#auth).

Returns an access control rule.
[Try it now](#try-it).

## Request

### HTTP request

```
GET https://www.googleapis.com/calendar/v3/calendars/calendarId/acl/ruleId
```

### Parameters

| Parameter name | Value | Description |
| --- | --- | --- |
| **Path parameters** | | |
| `calendarId` | `string` | Calendar identifier. To retrieve calendar IDs call the [calendarList.list](/workspace/calendar/api/v3/reference/calendarList/list) method. If you want to access the primary calendar of the currently logged in user, use the "`primary`" keyword. |
| `ruleId` | `string` | ACL rule identifier. |

### Authorization

This request requires authorization with at least one of the following scopes:

| Scope |
| --- |
| `https://www.googleapis.com/auth/calendar.readonly` |
| `https://www.googleapis.com/auth/calendar` |
| `https://www.googleapis.com/auth/calendar.acls` |
| `https://www.googleapis.com/auth/calendar.acls.readonly` |

For more information, see the [authentication and authorization](/workspace/guides/configure-oauth-consent) page.

### Request body

Do not supply a request body with this method.

## Response

If successful, this method returns an [Acl resource](/workspace/calendar/api/v3/reference/acl#resource) in the response body.




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/api/v3/reference/calendarList

Send feedback

# CalendarList Stay organized with collections Save and categorize content based on your preferences.

The collection of calendars in the user's calendar list. See also [Calendars vs CalendarList](/workspace/calendar/api/concepts/events-calendars#calendar_and_calendar_list).

For a list of [methods](#methods) for this resource, see the end of this page.

## Resource representations

```
{
  "kind": "calendar#calendarListEntry",
  "etag": etag,
  "id": string,
  "summary": string,
  "description": string,
  "location": string,
  "timeZone": string,
  "dataOwner": string,
  "summaryOverride": string,
  "colorId": string,
  "backgroundColor": string,
  "foregroundColor": string,
  "hidden": boolean,
  "selected": boolean,
  "accessRole": string,
  "defaultReminders": [
    {
      "method": string,
      "minutes": integer
    }
  ],
  "notificationSettings": {
    "notifications": [
      {
        "type": string,
        "method": string
      }
    ]
  },
  "primary": boolean,
  "deleted": boolean,
  "conferenceProperties": {
    "allowedConferenceSolutionTypes": [
      string
    ]
  },
  "autoAcceptInvitations": boolean
}
```

| Property name | Value | Description | Notes |
| --- | --- | --- | --- |
| `accessRole` | `string` | The effective access role that the authenticated user has on the calendar. Read-only. Possible values are:  * "`freeBusyReader`" - Provides read access to free/busy information. * "`reader`" - Provides read access to the calendar. Private events will appear to users with reader access, but event details will be hidden. * "`writer`" - Provides read and write access to the calendar. Private events will appear to users with writer access, and event details will be visible. * "`owner`" - Provides manager access to the calendar. This role has all of the permissions of the writer role with the additional ability to see and modify access levels of other users.  Important: the `owner` role is different from the calendar's data owner. A calendar has a single data owner, but can have multiple users with `owner` role. |  |
| `autoAcceptInvitations` | `boolean` | Whether this calendar automatically accepts invitations. Only valid for resource calendars. Read-only. |  |
| `backgroundColor` | `string` | The main color of the calendar in the hexadecimal format "`#0088aa`". This property supersedes the index-based `colorId` property. To set or change this property, you need to specify `colorRgbFormat=true` in the parameters of the [insert](/calendar/v3/reference/calendarList/insert), [update](/calendar/v3/reference/calendarList/update) and [patch](/calendar/v3/reference/calendarList/patch) methods. Optional. | writable |
| `colorId` | `string` | The color of the calendar. This is an ID referring to an entry in the `calendar` section of the colors definition (see the [colors endpoint](/calendar/v3/reference/colors)). This property is superseded by the `backgroundColor` and `foregroundColor` properties and can be ignored when using these properties. Optional. | writable |
| `conferenceProperties` | `nested object` | Conferencing properties for this calendar, for example what types of conferences are allowed. |  |
| `conferenceProperties.allowedConferenceSolutionTypes[]` | `list` | The types of conference solutions that are supported for this calendar. The possible values are:   * `"eventHangout"` * `"eventNamedHangout"` * `"hangoutsMeet"`  Optional. |  |
| `dataOwner` | `string` | The email of the owner of the calendar. Set only for secondary calendars. Read-only. |  |
| `defaultReminders[]` | `list` | The default reminders that the authenticated user has for this calendar. | writable |
| `defaultReminders[].method` | `string` | The method used by this reminder. Possible values are:  * "`email`" - Reminders are sent via email. * "`popup`" - Reminders are sent via a UI popup.   Required when adding a reminder. | writable |
| `defaultReminders[].minutes` | `integer` | Number of minutes before the start of the event when the reminder should trigger. Valid values are between 0 and 40320 (4 weeks in minutes). Required when adding a reminder. | writable |
| `deleted` | `boolean` | Whether this calendar list entry has been deleted from the calendar list. Read-only. Optional. The default is False. |  |
| `description` | `string` | Description of the calendar. Optional. Read-only. |  |
| `etag` | `etag` | ETag of the resource. |  |
| `foregroundColor` | `string` | The foreground color of the calendar in the hexadecimal format "`#ffffff`". This property supersedes the index-based `colorId` property. To set or change this property, you need to specify `colorRgbFormat=true` in the parameters of the [insert](/calendar/v3/reference/calendarList/insert), [update](/calendar/v3/reference/calendarList/update) and [patch](/calendar/v3/reference/calendarList/patch) methods. Optional. | writable |
| `hidden` | `boolean` | Whether the calendar has been hidden from the list. Optional. The attribute is only returned when the calendar is hidden, in which case the value is `true`. | writable |
| `id` | `string` | Identifier of the calendar. |  |
| `kind` | `string` | Type of the resource ("calendar#calendarListEntry"). |  |
| `location` | `string` | Geographic location of the calendar as free-form text. Optional. Read-only. |  |
| `notificationSettings` | `object` | The notifications that the authenticated user is receiving for this calendar. | writable |
| `notificationSettings.notifications[]` | `list` | The list of notifications set for this calendar. |  |
| `notificationSettings.notifications[].method` | `string` | The method used to deliver the notification. The possible value is:  * "`email`" - Notifications are sent via email.   Required when adding a notification. | writable |
| `notificationSettings.notifications[].type` | `string` | The type of notification. Possible values are:  * "`eventCreation`" - Notification sent when a new event is put on the calendar. * "`eventChange`" - Notification sent when an event is changed. * "`eventCancellation`" - Notification sent when an event is cancelled. * "`eventResponse`" - Notification sent when an attendee responds to the event invitation. * "`agenda`" - An agenda with the events of the day (sent out in the morning).   Required when adding a notification. | writable |
| `primary` | `boolean` | Whether the calendar is the primary calendar of the authenticated user. Read-only. Optional. The default is False. |  |
| `selected` | `boolean` | Whether the calendar content shows up in the calendar UI. Optional. The default is False. | writable |
| `summary` | `string` | Title of the calendar. Read-only. |  |
| `summaryOverride` | `string` | The summary that the authenticated user has set for this calendar. Optional. | writable |
| `timeZone` | `string` | The time zone of the calendar. Optional. Read-only. |  |

## Methods

[delete](/workspace/calendar/api/v3/reference/calendarList/delete)
:   Removes a calendar from the user's calendar list.

[get](/workspace/calendar/api/v3/reference/calendarList/get)
:   Returns a calendar from the user's calendar list.

[insert](/workspace/calendar/api/v3/reference/calendarList/insert)
:   Inserts an existing calendar into the user's calendar list.

[list](/workspace/calendar/api/v3/reference/calendarList/list)
:   Returns the calendars on the user's calendar list.

[patch](/workspace/calendar/api/v3/reference/calendarList/patch)
:   Updates an existing calendar on the user's calendar list. This method supports patch semantics. Note that each patch request consumes three quota units; prefer using a `get` followed by an `update`. The field values you specify replace the existing values. Fields that you don't specify in the request remain unchanged. Array fields, if specified, overwrite the existing arrays; this discards any previous array elements.

[update](/workspace/calendar/api/v3/reference/calendarList/update)
:   Updates an existing calendar on the user's calendar list.

[watch](/workspace/calendar/api/v3/reference/calendarList/watch)
:   Watch for changes to CalendarList resources.




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/v3/reference/calendarList

Send feedback

# CalendarList Stay organized with collections Save and categorize content based on your preferences.

The collection of calendars in the user's calendar list. See also [Calendars vs CalendarList](/workspace/calendar/api/concepts/events-calendars#calendar_and_calendar_list).

For a list of [methods](#methods) for this resource, see the end of this page.

## Resource representations

```
{
  "kind": "calendar#calendarListEntry",
  "etag": etag,
  "id": string,
  "summary": string,
  "description": string,
  "location": string,
  "timeZone": string,
  "dataOwner": string,
  "summaryOverride": string,
  "colorId": string,
  "backgroundColor": string,
  "foregroundColor": string,
  "hidden": boolean,
  "selected": boolean,
  "accessRole": string,
  "defaultReminders": [
    {
      "method": string,
      "minutes": integer
    }
  ],
  "notificationSettings": {
    "notifications": [
      {
        "type": string,
        "method": string
      }
    ]
  },
  "primary": boolean,
  "deleted": boolean,
  "conferenceProperties": {
    "allowedConferenceSolutionTypes": [
      string
    ]
  },
  "autoAcceptInvitations": boolean
}
```

| Property name | Value | Description | Notes |
| --- | --- | --- | --- |
| `accessRole` | `string` | The effective access role that the authenticated user has on the calendar. Read-only. Possible values are:  * "`freeBusyReader`" - Provides read access to free/busy information. * "`reader`" - Provides read access to the calendar. Private events will appear to users with reader access, but event details will be hidden. * "`writer`" - Provides read and write access to the calendar. Private events will appear to users with writer access, and event details will be visible. * "`owner`" - Provides manager access to the calendar. This role has all of the permissions of the writer role with the additional ability to see and modify access levels of other users.  Important: the `owner` role is different from the calendar's data owner. A calendar has a single data owner, but can have multiple users with `owner` role. |  |
| `autoAcceptInvitations` | `boolean` | Whether this calendar automatically accepts invitations. Only valid for resource calendars. Read-only. |  |
| `backgroundColor` | `string` | The main color of the calendar in the hexadecimal format "`#0088aa`". This property supersedes the index-based `colorId` property. To set or change this property, you need to specify `colorRgbFormat=true` in the parameters of the [insert](/calendar/v3/reference/calendarList/insert), [update](/calendar/v3/reference/calendarList/update) and [patch](/calendar/v3/reference/calendarList/patch) methods. Optional. | writable |
| `colorId` | `string` | The color of the calendar. This is an ID referring to an entry in the `calendar` section of the colors definition (see the [colors endpoint](/calendar/v3/reference/colors)). This property is superseded by the `backgroundColor` and `foregroundColor` properties and can be ignored when using these properties. Optional. | writable |
| `conferenceProperties` | `nested object` | Conferencing properties for this calendar, for example what types of conferences are allowed. |  |
| `conferenceProperties.allowedConferenceSolutionTypes[]` | `list` | The types of conference solutions that are supported for this calendar. The possible values are:   * `"eventHangout"` * `"eventNamedHangout"` * `"hangoutsMeet"`  Optional. |  |
| `dataOwner` | `string` | The email of the owner of the calendar. Set only for secondary calendars. Read-only. |  |
| `defaultReminders[]` | `list` | The default reminders that the authenticated user has for this calendar. | writable |
| `defaultReminders[].method` | `string` | The method used by this reminder. Possible values are:  * "`email`" - Reminders are sent via email. * "`popup`" - Reminders are sent via a UI popup.   Required when adding a reminder. | writable |
| `defaultReminders[].minutes` | `integer` | Number of minutes before the start of the event when the reminder should trigger. Valid values are between 0 and 40320 (4 weeks in minutes). Required when adding a reminder. | writable |
| `deleted` | `boolean` | Whether this calendar list entry has been deleted from the calendar list. Read-only. Optional. The default is False. |  |
| `description` | `string` | Description of the calendar. Optional. Read-only. |  |
| `etag` | `etag` | ETag of the resource. |  |
| `foregroundColor` | `string` | The foreground color of the calendar in the hexadecimal format "`#ffffff`". This property supersedes the index-based `colorId` property. To set or change this property, you need to specify `colorRgbFormat=true` in the parameters of the [insert](/calendar/v3/reference/calendarList/insert), [update](/calendar/v3/reference/calendarList/update) and [patch](/calendar/v3/reference/calendarList/patch) methods. Optional. | writable |
| `hidden` | `boolean` | Whether the calendar has been hidden from the list. Optional. The attribute is only returned when the calendar is hidden, in which case the value is `true`. | writable |
| `id` | `string` | Identifier of the calendar. |  |
| `kind` | `string` | Type of the resource ("calendar#calendarListEntry"). |  |
| `location` | `string` | Geographic location of the calendar as free-form text. Optional. Read-only. |  |
| `notificationSettings` | `object` | The notifications that the authenticated user is receiving for this calendar. | writable |
| `notificationSettings.notifications[]` | `list` | The list of notifications set for this calendar. |  |
| `notificationSettings.notifications[].method` | `string` | The method used to deliver the notification. The possible value is:  * "`email`" - Notifications are sent via email.   Required when adding a notification. | writable |
| `notificationSettings.notifications[].type` | `string` | The type of notification. Possible values are:  * "`eventCreation`" - Notification sent when a new event is put on the calendar. * "`eventChange`" - Notification sent when an event is changed. * "`eventCancellation`" - Notification sent when an event is cancelled. * "`eventResponse`" - Notification sent when an attendee responds to the event invitation. * "`agenda`" - An agenda with the events of the day (sent out in the morning).   Required when adding a notification. | writable |
| `primary` | `boolean` | Whether the calendar is the primary calendar of the authenticated user. Read-only. Optional. The default is False. |  |
| `selected` | `boolean` | Whether the calendar content shows up in the calendar UI. Optional. The default is False. | writable |
| `summary` | `string` | Title of the calendar. Read-only. |  |
| `summaryOverride` | `string` | The summary that the authenticated user has set for this calendar. Optional. | writable |
| `timeZone` | `string` | The time zone of the calendar. Optional. Read-only. |  |

## Methods

[delete](/workspace/calendar/api/v3/reference/calendarList/delete)
:   Removes a calendar from the user's calendar list.

[get](/workspace/calendar/api/v3/reference/calendarList/get)
:   Returns a calendar from the user's calendar list.

[insert](/workspace/calendar/api/v3/reference/calendarList/insert)
:   Inserts an existing calendar into the user's calendar list.

[list](/workspace/calendar/api/v3/reference/calendarList/list)
:   Returns the calendars on the user's calendar list.

[patch](/workspace/calendar/api/v3/reference/calendarList/patch)
:   Updates an existing calendar on the user's calendar list. This method supports patch semantics. Note that each patch request consumes three quota units; prefer using a `get` followed by an `update`. The field values you specify replace the existing values. Fields that you don't specify in the request remain unchanged. Array fields, if specified, overwrite the existing arrays; this discards any previous array elements.

[update](/workspace/calendar/api/v3/reference/calendarList/update)
:   Updates an existing calendar on the user's calendar list.

[watch](/workspace/calendar/api/v3/reference/calendarList/watch)
:   Watch for changes to CalendarList resources.




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/api/v3/reference/events/quickAdd

Send feedback

# Events: quickAdd Stay organized with collections Save and categorize content based on your preferences.

**Note:**
Requires [authorization](#auth).

Creates an event based on a simple text string.
[Try it now](#try-it).

## Request

### HTTP request

```
POST https://www.googleapis.com/calendar/v3/calendars/calendarId/events/quickAdd
```

### Parameters

| Parameter name | Value | Description |
| --- | --- | --- |
| **Path parameters** | | |
| `calendarId` | `string` | Calendar identifier. To retrieve calendar IDs call the [calendarList.list](/workspace/calendar/api/v3/reference/calendarList/list) method. If you want to access the primary calendar of the currently logged in user, use the "`primary`" keyword. |
| **Required query parameters** | | |
| `text` | `string` | The text describing the event to be created. |
| **Optional query parameters** | | |
| `sendNotifications` | `boolean` | Deprecated. Please use [sendUpdates](/workspace/calendar/api/v3/reference/events/quickAdd#sendUpdates) instead.  Whether to send notifications about the creation of the event. Note that some emails might still be sent even if you set the value to `false`. The default is `false`. |
| `sendUpdates` | `string` | Guests who should receive notifications about the creation of the new event.   Acceptable values are:  * "`all`": Notifications are sent to all guests. * "`externalOnly`": Notifications are sent to non-Google Calendar guests only. * "`none`": No notifications are sent. For calendar migration tasks, consider using the [Events.import](/workspace/calendar/api/v3/reference/events/import) method instead. |

### Authorization

This request requires authorization with at least one of the following scopes:

| Scope |
| --- |
| `https://www.googleapis.com/auth/calendar` |
| `https://www.googleapis.com/auth/calendar.events` |
| `https://www.googleapis.com/auth/calendar.app.created` |
| `https://www.googleapis.com/auth/calendar.events.owned` |

For more information, see the [authentication and authorization](/workspace/guides/configure-oauth-consent) page.

### Request body

Do not supply a request body with this method.

## Response

If successful, this method returns an [Events resource](/workspace/calendar/api/v3/reference/events#resource) in the response body.




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/api/v3/reference/events/watch

Send feedback

# Events: watch Stay organized with collections Save and categorize content based on your preferences.

**Note:**
[Authorization](#auth) optional.

Watch for changes to Events resources.

## Request

### HTTP request

```
POST https://www.googleapis.com/calendar/v3/calendars/calendarId/events/watch
```

### Parameters

| Parameter name | Value | Description |
| --- | --- | --- |
| **Path parameters** | | |
| `calendarId` | `string` | Calendar identifier. To retrieve calendar IDs call the [calendarList.list](/workspace/calendar/api/v3/reference/calendarList/list) method. If you want to access the primary calendar of the currently logged in user, use the "`primary`" keyword. |
| **Optional query parameters** | | |
| `eventTypes` | `string` | Event types of resources to watch. Optional. This parameter can be repeated multiple times to watch resources of different types. If unset, returns all event types.   Acceptable values are:  * "`birthday`": Special all-day events with an annual recurrence. * "`default`": Regular events. * "`focusTime`": Focus time events. * "`fromGmail`": Events from Gmail. * "`outOfOffice`": Out of office events. * "`workingLocation`": Working location events. |

### Authorization

This request allows authorization with at least one of the following scopes:

| Scope |
| --- |
| `https://www.googleapis.com/auth/calendar.readonly` |
| `https://www.googleapis.com/auth/calendar` |
| `https://www.googleapis.com/auth/calendar.events.readonly` |
| `https://www.googleapis.com/auth/calendar.events` |
| `https://www.googleapis.com/auth/calendar.app.created` |
| `https://www.googleapis.com/auth/calendar.events.freebusy` |
| `https://www.googleapis.com/auth/calendar.events.owned` |
| `https://www.googleapis.com/auth/calendar.events.owned.readonly` |
| `https://www.googleapis.com/auth/calendar.events.public.readonly` |

For more information, see the [authentication and authorization](/workspace/guides/configure-oauth-consent) page.

### Request body

In the request body, supply data with the following structure:

```
{
  "id": string,
  "token": string,
  "type": string,
  "address": string,
  "params": {
    "ttl": string
  }
}
```

| Property name | Value | Description | Notes |
| --- | --- | --- | --- |
| `id` | `string` | A UUID or similar unique string that identifies this channel. |  |
| `token` | `string` | An arbitrary string delivered to the target address with each notification delivered over this channel. Optional. |  |
| `type` | `string` | The type of delivery mechanism used for this channel. Valid values are "`web_hook`" (or "`webhook`"). Both values refer to a channel where Http requests are used to deliver messages. |  |
| `address` | `string` | The address where notifications are delivered for this channel. |  |
| `params` | `object` | Additional parameters controlling delivery channel behavior. Optional. |  |
| `params.ttl` | `string` | The time-to-live in seconds for the notification channel. Default is 604800 seconds. |  |

## Response

If successful, this method returns a response body with the following structure:

```
{
  "kind": "api#channel",
  "id": string,
  "resourceId": string,
  "resourceUri": string,
  "token": string,
  "expiration": long
}
```

| Property name | Value | Description | Notes |
| --- | --- | --- | --- |
| `kind` | `string` | Identifies this as a notification channel used to watch for changes to a resource, which is "`api#channel`". |  |
| `id` | `string` | A UUID or similar unique string that identifies this channel. |  |
| `resourceId` | `string` | An opaque ID that identifies the resource being watched on this channel. Stable across different API versions. |  |
| `resourceUri` | `string` | A version-specific identifier for the watched resource. |  |
| `token` | `string` | An arbitrary string delivered to the target address with each notification delivered over this channel. Optional. |  |
| `expiration` | `long` | Date and time of notification channel expiration, expressed as a Unix timestamp, in milliseconds. Optional. |  |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/api/guides/recurringevents

Send feedback

# Recurring events Stay organized with collections Save and categorize content based on your preferences.

This document describes how to work with [recurring events](/workspace/calendar/concepts/events-calendars#recurring_events) and their instances.

## Create recurring events

Creating recurring events is similar to [creating](/workspace/calendar/v3/reference/events/insert) a regular (single) event with the [`event`](/workspace/calendar/v3/reference/events) resource's [`recurrence`](/workspace/calendar/v3/reference/events#recurrence) field set.

[Protocol](#protocol)[Java](#java)[.NET](#.net)[Python](#python)
More

[PHP](#php)[Ruby](#ruby)

```
POST /calendar/v3/calendars/primary/events
...

{
  "summary": "Appointment",
  "location": "Somewhere",
  "start": {
    "dateTime": "2011-06-03T10:00:00.000-07:00",
    "timeZone": "America/Los_Angeles"
  },
  "end": {
    "dateTime": "2011-06-03T10:25:00.000-07:00",
    "timeZone": "America/Los_Angeles"
  },
  "recurrence": [
    "RRULE:FREQ=WEEKLY;UNTIL=20110701T170000Z",
  ],
  "attendees": [
    {
      "email": "attendeeEmail",
      # Other attendee's data...
    },
    # ...
  ],
}
```

```
Event event = new Event();

event.setSummary("Appointment");
event.setLocation("Somewhere");

ArrayList<EventAttendee> attendees = new ArrayList<EventAttendee>();
attendees.add(new EventAttendee().setEmail("attendeeEmail"));
// ...
event.setAttendees(attendees);

DateTime start = DateTime.parseRfc3339("2011-06-03T10:00:00.000-07:00");
DateTime end = DateTime.parseRfc3339("2011-06-03T10:25:00.000-07:00");
event.setStart(new EventDateTime().setDateTime(start).setTimeZone("America/Los_Angeles"));
event.setEnd(new EventDateTime().setDateTime(end).setTimeZone("America/Los_Angeles"));
event.setRecurrence(Arrays.asList("RRULE:FREQ=WEEKLY;UNTIL=20110701T170000Z"));

Event recurringEvent = service.events().insert("primary", event).execute();

System.out.println(createdEvent.getId());
```

```
Event event = new Event()
    {
      Summary = "Appointment",
      Location = "Somewhere",
      Start = new EventDateTime() {
          DateTime = new DateTime("2011-06-03T10:00:00.000:-07:00")
          TimeZone = "America/Los_Angeles"
      },
      End = new EventDateTime() {
          DateTime = new DateTime("2011-06-03T10:25:00.000:-07:00")
          TimeZone = "America/Los_Angeles"
      },
      Recurrence = new String[] {
          "RRULE:FREQ=WEEKLY;UNTIL=20110701T170000Z"
      },
      Attendees = new List<EventAttendee>()
          {
            new EventAttendee() { Email: "attendeeEmail" },
            // ...
          }
    };

Event recurringEvent = service.Events.Insert(event, "primary").Fetch();

Console.WriteLine(recurringEvent.Id);
```

```
event = {
  'summary': 'Appointment',
  'location': 'Somewhere',
  'start': {
    'dateTime': '2011-06-03T10:00:00.000-07:00',
    'timeZone': 'America/Los_Angeles'
  },
  'end': {
    'dateTime': '2011-06-03T10:25:00.000-07:00',
    'timeZone': 'America/Los_Angeles'
  },
  'recurrence': [
    'RRULE:FREQ=WEEKLY;UNTIL=20110701T170000Z',
  ],
  'attendees': [
    {
      'email': 'attendeeEmail',
      # Other attendee's data...
    },
    # ...
  ],
}

recurring_event = service.events().insert(calendarId='primary', body=event).execute()

print recurring_event['id']
```

```
$event = new Google_Service_Calendar_Event();
$event->setSummary('Appointment');
$event->setLocation('Somewhere');
$start = new Google_Service_Calendar_EventDateTime();
$start->setDateTime('2011-06-03T10:00:00.000-07:00');
$start->setTimeZone('America/Los_Angeles');
$event->setStart($start);
$end = new Google_Service_Calendar_EventDateTime();
$end->setDateTime('2011-06-03T10:25:00.000-07:00');
$end->setTimeZone('America/Los_Angeles');
$event->setEnd($end);
$event->setRecurrence(array('RRULE:FREQ=WEEKLY;UNTIL=20110701T170000Z'));
$attendee1 = new Google_Service_Calendar_EventAttendee();
$attendee1->setEmail('attendeeEmail');
// ...
$attendees = array($attendee1,
                   // ...
                   );
$event->attendees = $attendees;
$recurringEvent = $service->events->insert('primary', $event);

echo $recurringEvent->getId();
```

```
event = Google::Apis::CalendarV3::Event.new(
  summary: 'Appointment',
  location: 'Somewhere',
  start: {
    date_time: '2011-06-03T10:00:00.000-07:00',
    time_zone:  'America/Los_Angeles'
  },
  end: {
    date_time: '2011-06-03T10:25:00.000-07:00',
    time_zone: 'America/Los_Angeles'
  },
  recurrence: ['RRULE:FREQ=WEEKLY;UNTIL=20110701T170000Z']
  attendees: [
    {
      email: 'attendeeEmail'
    },
    #...
  ]
)
response = client.insert_event('primary', event)
print response.id
```

## Access instances

To see all the [instances](/workspace/calendar/concepts/events-calendars#instances_and_exceptions) of a given
recurring event you can use the [events.instances()](/workspace/calendar/v3/reference/events/instances) request.

The [`events.list()`](/workspace/calendar/v3/reference/events/list) request by default
only returns single events, recurring events, and
[exceptions](/workspace/calendar/concepts/events-calendars#instances_and_exceptions);
instances that are not exceptions are not returned.
If the [`singleEvents`](/workspace/calendar/v3/reference/events/list#singleEvents) parameter
is set `true` then all individual instances appear in the result, but underlying recurring events don't. When a user who has free/busy permissions queries `events.list()`,
it behaves as if `singleEvent` is `true`. For more information about access control list rules, see [Acl](/calendar/v3/reference/acl).

**Warning:** Do not modify instances individually when you want to modify
the entire recurring event, or ["this and following"](#modifying_all_following_instances) instances.
This creates lots of exceptions that clutter the calendar, slowing down access and sending a high number
of change notifications to users.

Individual instances are similar to single events. Unlike their parent recurring events,
instances do not have the [`recurrence`](/workspace/calendar/v3/reference/events#recurrence) field set.

The following event fields are specific to instances:

* [`recurringEventId`](/workspace/calendar/v3/reference/events#recurringEventId) — the ID of the parent recurring event this instance belongs to
* [`originalStartTime`](/workspace/calendar/v3/reference/events#originalStartTime) —
  the time this instance starts according to the recurrence data in the parent recurring event.
  This can be different from the actual [`start`](/workspace/calendar/v3/reference/events#start) time if the instance was rescheduled.
  It uniquely identifies the instance within the recurring event series even if the instance was moved.

## Modify or delete instances

To modify a single instance (creating an exception), client applications must first retrieve the instance and then update it by sending an authorized PUT request to the instance edit URL with updated data in the body.
The URL is of the form:

```
https://www.googleapis.com/calendar/v3/calendars/calendarId/events/instanceId
```

Use appropriate values in place of calendarId and instanceId.

**Note:** The special calendarId value `primary` can be used to refer to the authenticated user's primary calendar.

Upon success, the server responds with an HTTP 200 OK status code with the updated instance.
The following example shows how to cancel an instance of a recurring event.

[Protocol](#protocol)[Java](#java)[.NET](#.net)[Python](#python)[PHP](#php)[Ruby](#ruby)
More

```
PUT /calendar/v3/calendars/primary/events/instanceId
...

{
  "kind": "calendar#event",
  "id": "instanceId",
  "etag": "instanceEtag",
  "status": "cancelled",
  "htmlLink": "https://www.google.com/calendar/event?eid=instanceEid",
  "created": "2011-05-23T22:27:01.000Z",
  "updated": "2011-05-23T22:27:01.000Z",
  "summary": "Recurring event",
  "location": "Somewhere",
  "creator": {
    "email": "userEmail"
  },
  "recurringEventId": "recurringEventId",
  "originalStartTime": "2011-06-03T10:00:00.000-07:00",
  "organizer": {
    "email": "userEmail",
    "displayName": "userDisplayName"
  },
  "start": {
    "dateTime": "2011-06-03T10:00:00.000-07:00",
    "timeZone": "America/Los_Angeles"
  },
  "end": {
    "dateTime": "2011-06-03T10:25:00.000-07:00",
    "timeZone": "America/Los_Angeles"
  },
  "iCalUID": "eventUID",
  "sequence": 0,
  "attendees": [
    {
      "email": "attendeeEmail",
      "displayName": "attendeeDisplayName",
      "responseStatus": "needsAction"
    },
    # ...
    {
      "email": "userEmail",
      "displayName": "userDisplayName",
      "responseStatus": "accepted",
      "organizer": true,
      "self": true
    }
  ],
  "guestsCanInviteOthers": false,
  "guestsCanSeeOtherGuests": false,
  "reminders": {
    "useDefault": true
  }
}
```

```
// First retrieve the instances from the API.
Events instances = service.events().instances("primary", "recurringEventId").execute();

// Select the instance to cancel.
Event instance = instances.getItems().get(0);
instance.setStatus("cancelled");

Event updatedInstance = service.events().update("primary", instance.getId(), instance).execute();

// Print the updated date.
System.out.println(updatedInstance.getUpdated());
```

```
// First retrieve the instances from the API.
Events instances = service.Events.Instances("primary", "recurringEventId").Fetch();

// Select the instance to cancel.
Event instance = instances.Items[0];
instance.Status = "cancelled";

Event updatedInstance = service.Events.Update(instance, "primary", instance.Id).Fetch();

// Print the updated date.
Console.WriteLine(updatedInstance.Updated);
```

```
# First retrieve the instances from the API.
instances = service.events().instances(calendarId='primary', eventId='recurringEventId').execute()

# Select the instance to cancel.
instance = instances['items'][0]
instance['status'] = 'cancelled'

updated_instance = service.events().update(calendarId='primary', eventId=instance['id'], body=instance).execute()

# Print the updated date.
print updated_instance['updated']
```

```
$events = $service->events->instances("primary", "eventId");

// Select the instance to cancel.
$instance = $events->getItems()[0];
$instance->setStatus('cancelled');

$updatedInstance = $service->events->update('primary', $instance->getId(), $instance);

// Print the updated date.
echo $updatedInstance->getUpdated();
```

```
# First retrieve the instances from the API.
instances = client.list_event_instances('primary', 'recurringEventId')

# Select the instance to cancel.
instance = instances.items[0]
instance.status = 'cancelled'

response = client.update_event('primary', instance.id, instance)
print response.updated
```

## Modify all following instances

In order to change all the instances of a recurring event on or after a given (target) instance,
you must make two separate API requests. These requests split the original recurring event into two:
the original one which retains the instances without the change and the new recurring event having
instances where the change is applied:

1. Call [`events.update()`](/workspace/calendar/v3/reference/events/update) to
   trim the original recurring event of the instances to be updated. Do this by setting the
   `UNTIL` component of the `RRULE` to point before the start time of the
   first target instance. Alternatively, you can set the`COUNT` component instead of
   `UNTIL`.
2. Call [`events.insert()`](/workspace/calendar/v3/reference/events/insert) to
   create a new recurring event with all the same data as the original, except for the
   change you are attempting to make. The new recurring event must have the start time of
   the target instance.

This example shows how to change the location to "Somewhere else", starting from the third
instance of the recurring event from the previous examples.

[Protocol](#protocol)
More

```
# Updating the original recurring event to trim the instance list:

PUT /calendar/v3/calendars/primary/events/recurringEventId
...

{
  "summary": "Appointment",
  "location": "Somewhere",
  "start": {
    "dateTime": "2011-06-03T10:00:00.000-07:00",
    "timeZone": "America/Los_Angeles"
  },
  "end": {
    "dateTime": "2011-06-03T10:25:00.000-07:00",
    "timeZone": "America/Los_Angeles"
  },
  "recurrence": [
    "RRULE:FREQ=WEEKLY;UNTIL=20110617T065959Z",
  ],
  "attendees": [
    {
      "email": "attendeeEmail",
      # Other attendee's data...
    },
    # ...
  ],
}


# Creating a new recurring event with the change applied:

POST /calendar/v3/calendars/primary/events
...

{
  "summary": "Appointment",
  "location": "Somewhere else",
  "start": {
    "dateTime": "2011-06-17T10:00:00.000-07:00",
    "timeZone": "America/Los_Angeles"
  },
  "end": {
    "dateTime": "2011-06-17T10:25:00.000-07:00",
    "timeZone": "America/Los_Angeles"
  },
  "recurrence": [
    "RRULE:FREQ=WEEKLY;UNTIL=20110617T065959Z",
  ],
  "attendees": [
    {
      "email": "attendeeEmail",
      # Other attendee's data...
    },
    # ...
  ],
}
```

**Note:** Changing all following instances resets any exceptions happening
after the target instance.




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/v3/sync

Send feedback

# Synchronize resources efficiently Stay organized with collections Save and categorize content based on your preferences.

This guide describes how to
implement "incremental synchronization" of calendar data. Using this
method, you can keep data for all calendar collections in sync while saving
bandwidth.

## Contents

## Overview

Incremental synchronization consists of two stages:

1. Initial full sync is performed once at the very beginning in order to fully
   synchronize the client’s state with the server’s state. The client will obtain
   a sync token that it needs to persist.
2. Incremental sync is performed repeatedly and updates the client with all
   the changes that happened ever since the previous sync. Each time, the client
   provides the previous sync token it obtained from the server and stores the new sync token from the response.

A **sync token** is a piece of data
exchanged between the server and the client, and has a critical role in
the synchronization process. An example would look like the following:

`"nextSyncToken": "CPDAlvWDx70CEPDAlvWDx70CGAU=",`

## Initial full sync

The initial full sync is the original request for all the resources of the
collection you want to synchronize. You can optionally restrict the list
request using request parameters if you only want to synchronize a specific
subset of resources.

In the response to the list operation, you will find a field called
`nextSyncToken` representing a sync token. You'll need to store the value of
`nextSyncToken`. If the result set is too large and the response gets
[paginated](/workspace/calendar/v3/pagination), then the `nextSyncToken`
field is present only on the very last page.

You don’t need to worry about any new entries appearing
while you are paginating — they won’t be missed. The information
needed for the server to generate a correct sync token is encoded in the
page token.

## Incremental sync

Incremental sync allows you to retrieve all the resources that have been
modified since the last sync request. To do this, you need to perform a list
request with your most recent sync token specified in the `syncToken` field.
Keep in mind that the result will always contain deleted entries, so that the
clients get the chance to remove them from storage.

In cases where a large number of resources have changed since the last
incremental sync request, you may find a `pageToken` instead of a `syncToken` in the list result. In these cases you'll need to perform the exact same
list query as was used for retrieval of the first page in the incremental sync
(with the exact same `syncToken`), append the `pageToken` to it and
paginate through all the following requests until you find another `syncToken` on the last page. Make sure to store this `syncToken` for the next sync
request in the future.

Here are example queries for a case requiring incremental paginated sync:

**Original query**

```
GET /calendars/primary/events?maxResults=10&singleEvents=true&syncToken=CPDAlvWDx70CEPDAlvWDx

// Result contains the following

"nextPageToken":"CiAKGjBpNDd2Nmp2Zml2cXRwYjBpOXA",
```

**Retrieving next page**

```
GET /calendars/primary/events?maxResults=10&singleEvents=true&syncToken=CPDAlvWDx70CEPDAlvWDx&pageToken=CiAKGjBpNDd2Nmp2Zml2cXRwYjBpOXA
```

The set of query parameters that can be used on incremental
syncs is restricted. Each list request should use the same set of query
parameters, including the initial request. For the individual restrictions on
each collection, see the corresponding documentation for list requests. The
response code for list queries containing disallowed restrictions is
`400`. 

## Full sync required by server

Sometimes sync tokens are invalidated by the server, for various reasons
including token expiration or changes in related ACLs.
In such cases, the server will respond to an incremental request with a
response code `410`. This should trigger a full wipe of the client’s store
and a new full sync.

## Sample code

The snippet of sample code below demonstrates how to use sync tokens with the
[Java client library](/api-client-library/java/apis/calendar/v3). The first time
the run method is called it will perform a full sync and store the sync token.
On each subsequent execution it will load the saved sync token and perform an
incremental sync.

```
  private static void run() throws IOException {
    // Construct the {@link Calendar.Events.List} request, but don't execute it yet.
    Calendar.Events.List request = client.events().list("primary");

    // Load the sync token stored from the last execution, if any.
    String syncToken = syncSettingsDataStore.get(SYNC_TOKEN_KEY);
    if (syncToken == null) {
      System.out.println("Performing full sync.");

      // Set the filters you want to use during the full sync. Sync tokens aren't compatible with
      // most filters, but you may want to limit your full sync to only a certain date range.
      // In this example we are only syncing events up to a year old.
      Date oneYearAgo = Utils.getRelativeDate(java.util.Calendar.YEAR, -1);
      request.setTimeMin(new DateTime(oneYearAgo, TimeZone.getTimeZone("UTC")));
    } else {
      System.out.println("Performing incremental sync.");
      request.setSyncToken(syncToken);
    }

    // Retrieve the events, one page at a time.
    String pageToken = null;
    Events events = null;
    do {
      request.setPageToken(pageToken);

      try {
        events = request.execute();
      } catch (GoogleJsonResponseException e) {
        if (e.getStatusCode() == 410) {
          // A 410 status code, "Gone", indicates that the sync token is invalid.
          System.out.println("Invalid sync token, clearing event store and re-syncing.");
          syncSettingsDataStore.delete(SYNC_TOKEN_KEY);
          eventDataStore.clear();
          run();
        } else {
          throw e;
        }
      }

      List<Event> items = events.getItems();
      if (items.size() == 0) {
        System.out.println("No new events to sync.");
      } else {
        for (Event event : items) {
          syncEvent(event);
        }
      }

      pageToken = events.getNextPageToken();
    } while (pageToken != null);

    // Store the sync token from the last request to be used during the next execution.
    syncSettingsDataStore.set(SYNC_TOKEN_KEY, events.getNextSyncToken());

    System.out.println("Sync complete.");
  }

SyncTokenSample.java
```

## Legacy synchronization

For event collections, it is still possible to do synchronization in the
legacy manner by preserving the value of the updated field from an events list
request and then using the `modifiedSince` field to retrieve updated events.
This approach is no longer recommended as it is more error-prone with respect
to missed updates (for example if does not enforce query restrictions).
Furthermore, it is available only for events.




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/v3/reference/freebusy/query

Send feedback

# Freebusy: query Stay organized with collections Save and categorize content based on your preferences.

**Note:**
[Authorization](#auth) optional.

Returns free/busy information for a set of calendars.
[Try it now](#try-it).

## Request

### HTTP request

```
POST https://www.googleapis.com/calendar/v3/freeBusy
```

### Authorization

This request allows authorization with at least one of the following scopes:

| Scope |
| --- |
| `https://www.googleapis.com/auth/calendar.readonly` |
| `https://www.googleapis.com/auth/calendar` |
| `https://www.googleapis.com/auth/calendar.events.freebusy` |
| `https://www.googleapis.com/auth/calendar.freebusy` |

For more information, see the [authentication and authorization](/workspace/guides/configure-oauth-consent) page.

### Request body

In the request body, supply data with the following structure:

```
{
  "timeMin": datetime,
  "timeMax": datetime,
  "timeZone": string,
  "groupExpansionMax": integer,
  "calendarExpansionMax": integer,
  "items": [
    {
      "id": string
    }
  ]
}
```

| Property name | Value | Description | Notes |
| --- | --- | --- | --- |
| `timeMin` | `datetime` | The start of the interval for the query formatted as per [RFC3339](https://tools.ietf.org/html/rfc3339). |  |
| `timeMax` | `datetime` | The end of the interval for the query formatted as per [RFC3339](https://tools.ietf.org/html/rfc3339). |  |
| `timeZone` | `string` | Time zone used in the response. Optional. The default is UTC. |  |
| `groupExpansionMax` | `integer` | Maximal number of calendar identifiers to be provided for a single group. Optional. An error is returned for a group with more members than this value. Maximum value is 100. |  |
| `calendarExpansionMax` | `integer` | Maximal number of calendars for which FreeBusy information is to be provided. Optional. Maximum value is 50. |  |
| `items[]` | `list` | List of calendars and/or groups to query. |  |
| `items[].id` | `string` | The identifier of a calendar or a group. |  |

## Response

If successful, this method returns a response body with the following structure:

```
{
  "kind": "calendar#freeBusy",
  "timeMin": datetime,
  "timeMax": datetime,
  "groups": {
    (key): {
      "errors": [
        {
          "domain": string,
          "reason": string
        }
      ],
      "calendars": [
        string
      ]
    }
  },
  "calendars": {
    (key): {
      "errors": [
        {
          "domain": string,
          "reason": string
        }
      ],
      "busy": [
        {
          "start": datetime,
          "end": datetime
        }
      ]
    }
  }
}
```

| Property name | Value | Description | Notes |
| --- | --- | --- | --- |
| `kind` | `string` | Type of the resource ("calendar#freeBusy"). |  |
| `timeMin` | `datetime` | The start of the interval. |  |
| `timeMax` | `datetime` | The end of the interval. |  |
| `groups` | `object` | Expansion of groups. |  |
| `groups.(key)` | `nested object` | List of calendars that are members of this group. |  |
| `groups.(key).errors[]` | `list` | Optional error(s) (if computation for the group failed). |  |
| `groups.(key).errors[].domain` | `string` | Domain, or broad category, of the error. |  |
| `groups.(key).errors[].reason` | `string` | Specific reason for the error. Some of the possible values are:  * "`groupTooBig`" - The group of users requested is too large for a single query. * "`tooManyCalendarsRequested`" - The number of calendars requested is too large for a single query. * "`notFound`" - The requested resource was not found. * "`internalError`" - The API service has encountered an internal error.  Additional error types may be added in the future, so clients should gracefully handle additional error statuses not included in this list. |  |
| `groups.(key).calendars[]` | `list` | List of calendars' identifiers within a group. |  |
| `calendars` | `object` | List of free/busy information for calendars. |  |
| `calendars.(key)` | `nested object` | Free/busy expansions for a single calendar. |  |
| `calendars.(key).errors[]` | `list` | Optional error(s) (if computation for the calendar failed). |  |
| `calendars.(key).errors[].domain` | `string` | Domain, or broad category, of the error. |  |
| `calendars.(key).errors[].reason` | `string` | Specific reason for the error. Some of the possible values are:  * "`groupTooBig`" - The group of users requested is too large for a single query. * "`tooManyCalendarsRequested`" - The number of calendars requested is too large for a single query. * "`notFound`" - The requested resource was not found. * "`internalError`" - The API service has encountered an internal error.  Additional error types may be added in the future, so clients should gracefully handle additional error statuses not included in this list. |  |
| `calendars.(key).busy[]` | `list` | List of time ranges during which this calendar should be regarded as busy. |  |
| `calendars.(key).busy[].start` | `datetime` | The (inclusive) start of the time period. |  |
| `calendars.(key).busy[].end` | `datetime` | The (exclusive) end of the time period. |  |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/api/v3/reference/settings

Send feedback

# Settings Stay organized with collections Save and categorize content based on your preferences.

Setting resources represent settings that users can change from the Calendar UI, such as the user's time zone. They can be retrieved via [list](/workspace/calendar/api/v3/reference/settings/list) and [get](/workspace/calendar/api/v3/reference/settings/get) methods. Note that if a setting has its default value, it might not be returned.  
  
The list of supported settings:

| Setting id | Description | Allowed values | Default value |
| --- | --- | --- | --- |
| autoAddHangouts | Whether to automatically add video conferences (Meet or add-on) to all events. Note this setting is ignored by the server if the conferenceDataVersion is larger than 0 as it is the client’s responsibility to handle the logic according to this setting. Read only. | “true”, “false” | “false” |
| dateFieldOrder | What should the order of day (D), month (M) and year (Y) be when displaying dates. | ”MDY”, “DMY”, “YMD” | ”MDY” |
| defaultEventLength | The default length of events (in minutes) that were created without an explicit duration. | positive number | “60” |
| format24HourTime | Whether to show the time in 24 hour format. | “true”, “false” | “false” |
| hideInvitations | Whether to hide events to which the user is invited but hasn’t acted on (for example by responding). | “true”, “false” | “false” |
| hideWeekends | Whether the weekends should be hidden when displaying a week. | “true”, “false” | “false” |
| locale | User’s locale. | "in", "ca","cs", "da", "de", "en\_GB", "en", "es", "es\_419", "tl", "fr", "hr", "it", "lv", "lt", "hu", "nl", "no", "pl", "pt\_BR", "pt\_PT", "ro", "sk", "sl", "fi", "sv", "tr", "vi", "el", "ru", "sr", "uk", "bg", "iw", "ar", "fa", "hi", "th", "zh\_TW", "zh\_CN", "ja", "ko" | “en” |
| remindOnRespondedEventsOnly | Whether event reminders should be sent only for events with the user’s response status “Yes” and “Maybe”. | “true”, “false” | “false” |
| showDeclinedEvents | Whether events to which the user responded “No” should be shown on the user’s calendar. | “true”, “false” | “true” |
| timezone | The ID of the user’s timezone. | See <http://www.iana.org/time-zones> | “Etc/GMT” |
| useKeyboardShortcuts | Whether the keyboard shortcuts are enabled. | “true”, “false” | “true” |
| weekStart | Whether the week should start on Sunday (0), Monday (1) or Saturday (6). | "0", "1", "6" | “0” |

For a list of [methods](#methods) for this resource, see the end of this page.

## Resource representations

```
{
  "kind": "calendar#setting",
  "etag": etag,
  "id": string,
  "value": string
}
```

| Property name | Value | Description | Notes |
| --- | --- | --- | --- |
| `etag` | `etag` | ETag of the resource. |  |
| `id` | `string` | The id of the user setting. |  |
| `kind` | `string` | Type of the resource ("`calendar#setting`"). |  |
| `value` | `string` | Value of the user setting. The format of the value depends on the ID of the setting. It must always be a UTF-8 string of length up to 1024 characters. |  |

## Methods

[get](/workspace/calendar/api/v3/reference/settings/get)
:   Returns a single user setting.

[list](/workspace/calendar/api/v3/reference/settings/list)
:   Returns all user settings for the authenticated user.

[watch](/workspace/calendar/api/v3/reference/settings/watch)
:   Watch for changes to Settings resources.




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/api/v3/reference

Send feedback

# API Reference Stay organized with collections Save and categorize content based on your preferences.

This API reference is organized by resource type. Each resource type has one or more data representations and one or more methods.

## Resource types

1. [Acl](#Acl)
2. [CalendarList](#CalendarList)
3. [Calendars](#Calendars)
4. [Channels](#Channels)
5. [Colors](#Colors)
6. [Events](#Events)
7. [Freebusy](#Freebusy)
8. [Settings](#Settings)

## Acl

For Acl Resource details, see the [resource representation](/workspace/calendar/api/v3/reference/acl#resource) page.

| Method | HTTP request | Description |
| --- | --- | --- |
| URIs relative to https://www.googleapis.com/calendar/v3, unless otherwise noted | | |
| [delete](/workspace/calendar/api/v3/reference/acl/delete) | `DELETE  /calendars/calendarId/acl/ruleId` | Deletes an access control rule. |
| [get](/workspace/calendar/api/v3/reference/acl/get) | `GET  /calendars/calendarId/acl/ruleId` | Returns an access control rule. |
| [insert](/workspace/calendar/api/v3/reference/acl/insert) | `POST  /calendars/calendarId/acl` | Creates an access control rule. |
| [list](/workspace/calendar/api/v3/reference/acl/list) | `GET  /calendars/calendarId/acl` | Returns the rules in the access control list for the calendar. |
| [patch](/workspace/calendar/api/v3/reference/acl/patch) | `PATCH  /calendars/calendarId/acl/ruleId` | Updates an access control rule. This method supports patch semantics. Note that each patch request consumes three quota units; prefer using a `get` followed by an `update`. The field values you specify replace the existing values. Fields that you don't specify in the request remain unchanged. Array fields, if specified, overwrite the existing arrays; this discards any previous array elements. |
| [update](/workspace/calendar/api/v3/reference/acl/update) | `PUT  /calendars/calendarId/acl/ruleId` | Updates an access control rule. |
| [watch](/workspace/calendar/api/v3/reference/acl/watch) | `POST  /calendars/calendarId/acl/watch` | Watch for changes to ACL resources. |

## CalendarList

For CalendarList Resource details, see the [resource representation](/workspace/calendar/api/v3/reference/calendarList#resource) page.

| Method | HTTP request | Description |
| --- | --- | --- |
| URIs relative to https://www.googleapis.com/calendar/v3, unless otherwise noted | | |
| [delete](/workspace/calendar/api/v3/reference/calendarList/delete) | `DELETE  /users/me/calendarList/calendarId` | Removes a calendar from the user's calendar list. |
| [get](/workspace/calendar/api/v3/reference/calendarList/get) | `GET  /users/me/calendarList/calendarId` | Returns a calendar from the user's calendar list. |
| [insert](/workspace/calendar/api/v3/reference/calendarList/insert) | `POST  /users/me/calendarList` | Inserts an existing calendar into the user's calendar list. |
| [list](/workspace/calendar/api/v3/reference/calendarList/list) | `GET  /users/me/calendarList` | Returns the calendars on the user's calendar list. |
| [patch](/workspace/calendar/api/v3/reference/calendarList/patch) | `PATCH  /users/me/calendarList/calendarId` | Updates an existing calendar on the user's calendar list. This method supports patch semantics. Note that each patch request consumes three quota units; prefer using a `get` followed by an `update`. The field values you specify replace the existing values. Fields that you don't specify in the request remain unchanged. Array fields, if specified, overwrite the existing arrays; this discards any previous array elements. |
| [update](/workspace/calendar/api/v3/reference/calendarList/update) | `PUT  /users/me/calendarList/calendarId` | Updates an existing calendar on the user's calendar list. |
| [watch](/workspace/calendar/api/v3/reference/calendarList/watch) | `POST  /users/me/calendarList/watch` | Watch for changes to CalendarList resources. |

## Calendars

For Calendars Resource details, see the [resource representation](/workspace/calendar/api/v3/reference/calendars#resource) page.

| Method | HTTP request | Description |
| --- | --- | --- |
| URIs relative to https://www.googleapis.com/calendar/v3, unless otherwise noted | | |
| [clear](/workspace/calendar/api/v3/reference/calendars/clear) | `POST  /calendars/calendarId/clear` | Clears a primary calendar. This operation deletes all events associated with the primary calendar of an account. |
| [delete](/workspace/calendar/api/v3/reference/calendars/delete) | `DELETE  /calendars/calendarId` | Deletes a secondary calendar. Use calendars.clear for clearing all events on primary calendars. |
| [get](/workspace/calendar/api/v3/reference/calendars/get) | `GET  /calendars/calendarId` | Returns metadata for a calendar. |
| [insert](/workspace/calendar/api/v3/reference/calendars/insert) | `POST  /calendars` | Creates a secondary calendar. The authenticated user for the request is made the data owner of the new calendar.   **Note:** We recommend to authenticate as the intended data owner of the calendar. You can use [domain-wide delegation of authority](/workspace/cloud-search/docs/guides/delegation) to allow applications to act on behalf of a specific user. Don't use a service account for authentication. If you use a service account for authentication, the service account is the data owner, which can lead to unexpected behavior. For example, if a service account is the data owner, data ownership cannot be transferred. |
| [patch](/workspace/calendar/api/v3/reference/calendars/patch) | `PATCH  /calendars/calendarId` | Updates metadata for a calendar. This method supports patch semantics. Note that each patch request consumes three quota units; prefer using a `get` followed by an `update`. The field values you specify replace the existing values. Fields that you don't specify in the request remain unchanged. Array fields, if specified, overwrite the existing arrays; this discards any previous array elements. |
| [update](/workspace/calendar/api/v3/reference/calendars/update) | `PUT  /calendars/calendarId` | Updates metadata for a calendar. |

## Channels

For Channels Resource details, see the [resource representation](/workspace/calendar/api/v3/reference/channels#resource) page.

| Method | HTTP request | Description |
| --- | --- | --- |
| URIs relative to https://www.googleapis.com/calendar/v3, unless otherwise noted | | |
| [stop](/workspace/calendar/api/v3/reference/channels/stop) | `POST  /channels/stop` | Stop watching resources through this channel. |

## Colors

For Colors Resource details, see the [resource representation](/workspace/calendar/api/v3/reference/colors#resource) page.

| Method | HTTP request | Description |
| --- | --- | --- |
| URIs relative to https://www.googleapis.com/calendar/v3, unless otherwise noted | | |
| [get](/workspace/calendar/api/v3/reference/colors/get) | `GET  /colors` | Returns the color definitions for calendars and events. |

## Events

For Events Resource details, see the [resource representation](/workspace/calendar/api/v3/reference/events#resource) page.

| Method | HTTP request | Description |
| --- | --- | --- |
| URIs relative to https://www.googleapis.com/calendar/v3, unless otherwise noted | | |
| [delete](/workspace/calendar/api/v3/reference/events/delete) | `DELETE  /calendars/calendarId/events/eventId` | Deletes an event. |
| [get](/workspace/calendar/api/v3/reference/events/get) | `GET  /calendars/calendarId/events/eventId` | Returns an event based on its Google Calendar ID. To retrieve an event using its iCalendar ID, call the [events.list method using the `iCalUID` parameter](/workspace/calendar/api/v3/reference/events/list#iCalUID). |
| [import](/workspace/calendar/api/v3/reference/events/import) | `POST  /calendars/calendarId/events/import` | Imports an event. This operation is used to add a private copy of an existing event to a calendar. Only events with an `eventType` of `default` may be imported. **Deprecated behavior:** If a non-`default` event is imported, its type will be changed to `default` and any event-type-specific properties it may have will be dropped. |
| [insert](/workspace/calendar/api/v3/reference/events/insert) | `POST  /calendars/calendarId/events` | Creates an event. |
| [instances](/workspace/calendar/api/v3/reference/events/instances) | `GET  /calendars/calendarId/events/eventId/instances` | Returns instances of the specified recurring event. |
| [list](/workspace/calendar/api/v3/reference/events/list) | `GET  /calendars/calendarId/events` | Returns events on the specified calendar. |
| [move](/workspace/calendar/api/v3/reference/events/move) | `POST  /calendars/calendarId/events/eventId/move` | Moves an event to another calendar, i.e. changes an event's organizer. Note that only `default` events can be moved; `birthday`, `focusTime`, `fromGmail`, `outOfOffice` and `workingLocation` events cannot be moved. **Required query parameters:** `destination` |
| [patch](/workspace/calendar/api/v3/reference/events/patch) | `PATCH  /calendars/calendarId/events/eventId` | Updates an event. This method supports patch semantics. Note that each patch request consumes three quota units; prefer using a `get` followed by an `update`. The field values you specify replace the existing values. Fields that you don't specify in the request remain unchanged. Array fields, if specified, overwrite the existing arrays; this discards any previous array elements. |
| [quickAdd](/workspace/calendar/api/v3/reference/events/quickAdd) | `POST  /calendars/calendarId/events/quickAdd` | Creates an event based on a simple text string. **Required query parameters:** `text` |
| [update](/workspace/calendar/api/v3/reference/events/update) | `PUT  /calendars/calendarId/events/eventId` | Updates an event. This method does not support patch semantics and always updates the entire event resource. To do a partial update, perform a `get` followed by an `update` using etags to ensure atomicity. |
| [watch](/workspace/calendar/api/v3/reference/events/watch) | `POST  /calendars/calendarId/events/watch` | Watch for changes to Events resources. |

## Freebusy

For Freebusy Resource details, see the [resource representation](/workspace/calendar/api/v3/reference/freebusy#resource) page.

| Method | HTTP request | Description |
| --- | --- | --- |
| URIs relative to https://www.googleapis.com/calendar/v3, unless otherwise noted | | |
| [query](/workspace/calendar/api/v3/reference/freebusy/query) | `POST  /freeBusy` | Returns free/busy information for a set of calendars. |

## Settings

For Settings Resource details, see the [resource representation](/workspace/calendar/api/v3/reference/settings#resource) page.

| Method | HTTP request | Description |
| --- | --- | --- |
| URIs relative to https://www.googleapis.com/calendar/v3, unless otherwise noted | | |
| [get](/workspace/calendar/api/v3/reference/settings/get) | `GET  /users/me/settings/setting` | Returns a single user setting. |
| [list](/workspace/calendar/api/v3/reference/settings/list) | `GET  /users/me/settings` | Returns all user settings for the authenticated user. |
| [watch](/workspace/calendar/api/v3/reference/settings/watch) | `POST  /users/me/settings/watch` | Watch for changes to Settings resources. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/api/releases

Send feedback

# Google Calendar API release notes Stay organized with collections Save and categorize content based on your preferences.

To get the latest product updates delivered to you, add the URL of this page to your
[feed
reader](https://wikipedia.org/wiki/Comparison_of_feed_aggregators), or add the feed URL directly: `https://developers.google.com/feeds/calendar-release-notes.xml`.

This page contains release notes for features and updates to the
Calendar API. We recommend that
Calendar API developers periodically check this list for any new
announcements.

## October 27, 2025

Feature

**Generally available starting November 10, 2025**:

Secondary calendars will now have a single data owner. This applies to both existing and newly created calendars. In the Calendar API, the data owner's email address will be in the read-only `dataOwner` field in the `Calendars` and `CalendarList` resources.

To prevent unintended actions and undesired states, the following new restrictions apply:

* Only the data owner can delete secondary calendars.
* The data owner's access level cannot be changed from the default `owner` access.
* The data owner cannot remove an owned calendar from their calendar list. They can hide it from their UI.

When a new secondary calendar is created, the authenticated user that makes the request is the data owner. We recommend that you use user authentication to create secondary calendars. Data ownership can be transferred in the Google Calendar UI.

For more details, see the documentation for [`Calendars`](https://developers.google.com/workspace/calendar/api/v3/reference/calendars) and [`CalendarList`](https://developers.google.com/workspace/calendar/api/v3/reference/calendarList) closer to November 10.

## November 19, 2024

Feature

You can now access birthday and other special events that are automatically created from Google Contacts using the Calendar API.

Birthday events now have [`birthdayProperties`](https://developers.google.com/calendar/api/v3/reference/events#birthdayProperties) that show birthday-specific event data, such as the type of the special event, whether it's a birthday, an anniversary, or another significant date, and the contact that the event is linked to. You can use the [contact](https://developers.google.com/calendar/api/v3/reference/events#birthdayProperties.contact) as a resource name in the [People API](https://developers.google.com/people) to fetch contact details.

To learn more, see the [developer guide for the birthday event type](https://developers.google.com/calendar/api/guides/event-types#birthday).

## August 05, 2024

Feature

**Generally available starting September 17, 2024:** Create and manage birthdays directly within Google Calendar. Birthdays are exposed in the Calendar API as a new [`eventType`](https://developers.google.com/calendar/api/v3/reference/events#eventType) called `"birthday"` which distinguishes special all-day events with an annual recurrence. Birthday events support a limited set of event properties.

You can filter by the birthday event type using the [`events.list()`](https://developers.google.com/calendar/api/v3/reference/events/list) and [`events.watch()`](https://developers.google.com/calendar/api/v3/reference/events/watch) methods. If no type filters are specified, all event types including birthdays are returned.

To learn more, see our [developer guide about working with the birthday event type](https://developers.google.com/calendar/api/guides/event-types#birthday).

## May 22, 2024

Change

The following changes to [events from Gmail](https://support.google.com/calendar/answer/6084018) take effect on **May 30, 2024**:

* Events from Gmail use `fromGmail` instead `default` as the value for the [`eventType`](https://developers.google.com/calendar/api/v3/reference/events/watch#eventTypes) field. You can filter by this new event type using the [`events.list()`](https://developers.google.com/calendar/api/v3/reference/events/list) and [`events.watch()`](https://developers.google.com/calendar/api/v3/reference/events/watch) methods.
* Events from Gmail use the email address of the email recipient as the event organizer instead of `unknownorganizer@calendar.google.com`.
* You can only update the event [properties](https://developers.google.com/calendar/api/v3/reference/events/update#request-body), such as reminders, color ID, visibility, status, and extended properties of `Event` resources with the event type `fromGmail`.

For details, see the Calendar API [`Events` reference documentation](https://developers.google.com/calendar/api/v3/reference/events).

## May 17, 2024

Change

The following change takes effect on **June 3, 2024**:

For [batch operations](https://developers.google.com/calendar/api/guides/batch) on [`Event`](https://developers.google.com/calendar/api/v3/reference/events) resources, a batched item returns an HTTP `409 Conflict` status code if the batch operation can't successfully execute this item due to conflicts with other requested batched items.

**Suggested action:** Exclude all successfully finished and failed batched items and retry remaining items in a different batch operation or by using single event operations.

For more information, see [Handle API errors](https://developers.google.com/calendar/api/guides/errors#409_conflict).

## February 07, 2024

Change

The following changes will take effect on **March 11, 2024**:

* The use of [event type](https://developers.google.com/calendar/api/v3/reference/events/watch#eventTypes) filters will be considered when reviewing quota increase requests. Before you request a quota increase, make sure you specify the event types you need as a parameter for your application.
* Both [`events.list`](https://developers.google.com/calendar/api/v3/reference/events/list) and [`events.watch`](https://developers.google.com/calendar/api/v3/reference/events/watch) will use the same default event type filter.
* To help with error handling, improved error messages will be returned when unsupported operations are attempted on special event types, such as working location, out-of-office, and focus time events.

For more information, refer to the following:

* [Manage focus time, out of office, and working location events](https://developers.google.com/calendar/api/guides/calendar-status#watch-calendar-status)
* [Manage quotas](https://developers.google.com/calendar/api/guides/quota#use_push_notifications)

## February 06, 2024

Announcement

**Generally available**: The `events.watch()` method now supports the `eventTypes` field as a query parameter so that you can subscribe to changes about specific Calendar events, such as working location, out-of-office, or focus time events. For details, see the [reference documentation](https://developers.google.com/calendar/api/v3/reference/events/watch).

## December 07, 2023

Fixed

To fix a bug that prevented events of `eventType != 'default'` from importing, we updated the code sample in [Populate a team vacation calendar](https://developers.google.com/apps-script/samples/automations/vacation-calendar), the popular Apps Script + Calendar API solution. Review the code change in [GitHub](https://github.com/googleworkspace/apps-script-samples/pull/434/files).

## August 17, 2023

Feature

**Generally available**: Reading and updating working locations using the Google Calendar API is now generally available. For details, see [Manage working locations for Google Calendar users](https://developers.google.com/calendar/api/guides/working-hours-and-location).

## August 22, 2022

Feature

**[Developer Preview](https://developers.google.com/workspace/preview)**: The Google Calendar API now supports reading and updating working locations. For details, see [Manage working locations for Google Calendar users](https://developers.google.com/calendar/api/guides/working-hours-and-location).

## March 23, 2022

Feature

The Calendar API now supports custom attachments. See [Calendar add-ons](https://developers.google.com/apps-script/add-ons/calendar) for more information.

## October 20, 2021

Feature

The Calendar API now exposes a new `eventType`. The new type is called `focusTime` and allows users of the API to distinguish the special focus time events. For more information, see the [API reference](https://developers.google.com/calendar/v3/reference/events).

## May 18, 2021

Feature

Two new quotas now exist for the Calendar API in addition to the general [Calendar usage limits](https://support.google.com/a/answer/2905486):

* Per minute per project.
* Per minute per project per user.

See [Manage quotas](https://developers.google.com/calendar/api/guides/quota) for more information.

## February 08, 2021

Feature

You can use the calendarId from the API endpoint `https://www.googleapis.com/calendar/v3/calendars/calendarId` to identify the owner of the out of office event.

Change

Starting today, all existing and new out of office events will be updated to set the organizer to `unknownorganizer@calendar.google.com` instead of the Calendar owner. It may take 2-3 weeks for this change to fully roll out.

## February 01, 2021

Feature

The Calendar API now exposes a new field for events. The new field is called `eventType` and allows users of the API to distinguish special event types, such as `outOfOffice`. For more information, see the [API reference](https://developers.google.com/calendar/v3/reference/events).

## January 11, 2021

Change

From now, we require `conferenceData` to be consistent with `conferenceData.conferenceSolution.key.type`; meaning only Google Meet calls can have `conferenceData.conferenceSolution.key.type` set to `hangoutsMeet`. All 3P video conference providers are expected to set `conferenceData.conferenceSolution.key.type` to `addOn`.

## September 07, 2020

Fixed

Meet video conferences should be added explicitly using the following existing parameters:

1. Set `conferenceDataVersion` query parameter to `1`.
2. Set `conferenceData.createRequest` event property as follows:
   * `conferenceData.createRequest.conferenceSolutionKey.type` to `hangoutsMeet`.
   * `conferenceData.createRequest.requestId` to unique request id.

Change

We stopped auto-populating Meet for API calls (such as `Events.insert`) to prevent Meet conferences being added unintentionally via 3rd parties.

## March 16, 2020

Change

Service accounts created on or after March 2, 2020 are only able to invite guests using [domain-wide delegation of authority](https://developers.google.com/calendar/auth#perform-g-suite-domain-wide-delegation-of-authority).

## September 27, 2019

Feature

The Calendar API allows attaching a conference data of type `addOn` to a new or existing event using `Events.insert` or `Events.update` methods.

## November 19, 2018

Change

Starting on January 7, 2019, notifications and reminders using the `sms` method type will be ignored. The API calls setting such notifications and reminders will still succeed and modify all the other fields.

Since Calendar offers in-app notifications, you can still get notified, regardless of your device or connection. For more information see [Google Calendar SMS notifications to be removed](https://gsuiteupdates.googleblog.com/2018/11/google-calendar-sms-notifications-to-be-removed.html).

## October 31, 2018

Feature

The Calendar API now supports four new OAuth scopes. The scopes allow your application to limit access to only the data you really need. See [Authorizing Google Calendar API Requests](https://developers.google.com/calendar/auth) for more details.

## October 02, 2018

Feature

A more flexible approach to sending event change notifications is now available through the [`sendUpdates` parameter](https://developers.google.com/calendar/v3/reference/events/insert#sendUpdates). The new parameter lets you set event change notifications to do one of the following:

* Notify all the event guests.
* Notify only the guests who are not using Google Calendar.
* Completely suppress the notifications, for example, during a migration.

Now it is possible to always keep in sync guests who use other calendaring systems, without sending too many non-mandatory emails to Google Calendar users.

## March 22, 2018

Deprecated

Support for the [JSON-RPC protocol](http://www.jsonrpc.org/specification) and [Global HTTP batch](https://developers.google.com/api-client-library/javascript/features/batch) endpoints has been deprecated, and will be fully discontinued on March 25, 2019. This change is being made to the Google API infrastructure and as such affects multiple Google APIs, including Calendar v3.

For more information and migration instructions, see the [Discontinuing support for JSON-RPC and Global HTTP Batch Endpoints blog post](https://developers.googleblog.com/2018/03/discontinuing-support-for-json-rpc-and.html).

## July 12, 2017

Feature

Hangouts and Google Meet conferences are now supported in Calendar events via the [`conferenceData` field](https://developers.google.com/calendar/v3/reference/events#conferenceData). You can:

* Read conference data associated with events.
* Copy conference data from one event to another.
* Request new conference generation for an event.
* Clear conference data associated with events.

To learn more, see [Create Events](https://developers.google.com/calendar/create-events#conferencing).




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/setup

Send feedback

### Enhance the Google Calendar experience

Insert interactive content, powered by your account data or an external service, with **add-ons**.

* Show contextual details from a third-party system when users view or create events.
* Show your custom conferencing solution when users create an event.

[View documentation](https://developers.google.com/workspace/add-ons/calendar)
[Learn about add-ons](https://developers.google.com/workspace/add-ons)

### Automate Google Calendar with simple code

Anyone can use **Apps Script** to automate and enhance Google Calendar in a web-based, low-code environment.

* Create events based on Google Form submissions.
* Update events or calendars from Google Sheets.
* Insert calendar data into Google Sheets for review.

[View documentation](https://developers.google.com/apps-script/reference/calendar)
[Learn about Apps Script](https://developers.google.com/apps-script)

### Build AI-powered Google Calendar solutions

Discover and try Google Calendar samples that help you get started with building AI features using AI models, agents, platforms, and more.

smart\_toy

### Travel Concierge agent

Build an AI agent add-on that integrates with ADK and Vertex AI Agent Engine.

[Open tutorial](https://developers.google.com/workspace/add-ons/samples/travel-concierge)

smart\_toy

### All samples

Explore add-on samples by featured Google products, language, sample type, and type.

[Explore catalog](https://developers.google.com/workspace/add-ons/samples?product=googlecalendar)

### Connect your service to Google Calendar

Use the REST APIs below to interact programmatically with Google Calendar.

### [Calendar API](https://developers.google.com/workspace/calendar/api)

**Read and update calendars** with several popular programming languages, such as Java, JavaScript, and Python.

[View documentation](https://developers.google.com/workspace/calendar/api)
[Try it out](https://developers.google.com/workspace/calendar/api/v3/reference/calendars/get?apix_params=%7B"calendarId"%3A"primary"%7D)

### [CalDAV API](https://developers.google.com/workspace/calendar/caldav)

**Use Google's CalDAV server** to read and update calendar data.

[View documentation](https://developers.google.com/workspace/calendar/caldav)

---
# https://developers.google.com/workspace/calendar/api/guides/pagination

Send feedback

# Page through lists of resources Stay organized with collections Save and categorize content based on your preferences.

You can control the maximum number of resources the server returns in the
response to a list request by setting the `maxResults` field. Furthermore,
for some collections (such as Events) there is a hard limit on the number of
retrieved entries that the server will never exceed. If the total number of
events exceeds this maximum, the server returns one page of results.

Remember that `maxResults` does not guarantee the number of results on one page.
Incomplete results can be detected by a non-empty `nextPageToken` field in
the result. In order to retrieve the next page, perform the exact same request
as previously and append a `pageToken` field with the value of
`nextPageToken` from the previous page. A new `nextPageToken` is provided
on the following pages until all the results are retrieved.

For example, here is a query followed by the query for retrieving the
next page of results in a paginated list:

```
GET /calendars/primary/events?maxResults=10&singleEvents=true

//Result contains

"nextPageToken":"CiAKGjBpNDd2Nmp2Zml2cXRwYjBpOXA",
```

The subsequent query takes the value from `nextPageToken` and
submits it as the value for `pageToken`:

```
GET /calendars/primary/events?maxResults=10&singleEvents=true&pageToken=CiAKGjBpNDd2Nmp2Zml2cXRwYjBpOXA
```




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/api/v3/reference/calendars/get

Send feedback

# Calendars: get Stay organized with collections Save and categorize content based on your preferences.

**Note:**
Requires [authorization](#auth).

Returns metadata for a calendar.
[Try it now](#try-it).

## Request

### HTTP request

```
GET https://www.googleapis.com/calendar/v3/calendars/calendarId
```

### Parameters

| Parameter name | Value | Description |
| --- | --- | --- |
| **Path parameters** | | |
| `calendarId` | `string` | Calendar identifier. To retrieve calendar IDs call the [calendarList.list](/workspace/calendar/api/v3/reference/calendarList/list) method. If you want to access the primary calendar of the currently logged in user, use the "`primary`" keyword. |

### Authorization

This request requires authorization with at least one of the following scopes:

| Scope |
| --- |
| `https://www.googleapis.com/auth/calendar.readonly` |
| `https://www.googleapis.com/auth/calendar` |
| `https://www.googleapis.com/auth/calendar.app.created` |
| `https://www.googleapis.com/auth/calendar.calendars` |
| `https://www.googleapis.com/auth/calendar.calendars.readonly` |

For more information, see the [authentication and authorization](/workspace/guides/configure-oauth-consent) page.

### Request body

Do not supply a request body with this method.

## Response

If successful, this method returns a [Calendars resource](/workspace/calendar/api/v3/reference/calendars#resource) in the response body.




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/caldav

Send feedback

# CalDAV API Developer's Guide Stay organized with collections Save and categorize content based on your preferences.

CalDAV is an extension of WebDAV that provides a standard for clients to access
calendar information on a remote server.

Google provides a CalDAV interface that you can use to view and manage calendars
using the CalDAV protocol.

## Specifications

For each of the relevant specifications, Google's CalDAV support is as follows:

* [rfc4918: HTTP Extensions for Web Distributed Authoring and Versioning
  (WebDAV)](http://tools.ietf.org/html/rfc4918)
  + Supports the HTTP methods `GET`, `PUT`, `HEAD`, `DELETE`, `POST`,
    `OPTIONS`, `PROPFIND` and `PROPPATCH`.
  + Does not support the HTTP methods `LOCK`, `UNLOCK`, `COPY`, `MOVE`, or
    `MKCOL`, or the `If*` header (except for `If-Match`).
  + Does not support arbitrary (user-defined) WebDAV properties.
  + Does not support WebDAV Access Control (rfc3744).
* [rfc4791: Calendaring Extensions to WebDAV (CalDAV)](http://tools.ietf.org/html/rfc4791)
  + Supports the HTTP method `REPORT`. All reports except free-busy-query
    are implemented.
  + Does not support the HTTP method `MKCALENDAR`.
  + Does not support the `AUDIO` action.
* [rfc5545: iCalendar](http://tools.ietf.org/html/rfc5545)
  + Data exposed in the CalDAV interface is formatted according to the
    iCalendar specification.
  + Does not currently support `VTODO` or `VJOURNAL` data.
  + Does not support the Apple iCal® extension to allow user-settable URL properties.
* [rfc6578: Collection Synchronization for WebDAV](http://tools.ietf.org/html/rfc6578)
  + Client applications must switch to this mode of operation after the
    initial sync.
* [rfc6638: Scheduling Extensions to CalDAV](http://tools.ietf.org/html/rfc6638)
  + Supports a trivial "inbox," which is always empty.
  + Invitations you receive are automatically delivered into your "events"
    collection rather than being placed into your "inbox."
  + Does not support free-busy lookup.
* [caldav-ctag-02: Calendar Collection Entity Tag (CTag) in CalDAV](https://trac.calendarserver.org/browser/CalendarServer/trunk/doc/Extensions/caldav-ctag.txt)
  + The calendar `ctag` is like a resource `etag`; it changes when anything
    in the calendar has changed. This allows the client application to
    quickly determine that it does not need to synchronize any changed
    events.
* [calendar-proxy: Calendar User Proxy Functionality in CalDAV](https://github.com/apple/ccs-calendarserver/blob/master/doc/Extensions/caldav-proxy.txt)
  + To improve the performance of calendar synching from iOS devices, which
    don't support delegation, using the `calendar-proxy-read-for` or
    `calendar-proxy-write-for` properties with an iOS UserAgent will fail.

We have not yet provided a full implementation of all of the relevant
specifications. However, for many clients such as Apple's Calendar app
the CalDAV protocol should interoperate correctly.

Note: For account security and to prevent abuse, Google
might set cookies on client applications that access data via CalDAV.

## Creating your client ID

To use the CalDAV API you need to have
a [Google Account](https://www.google.com/accounts/NewAccount).
If you already have an account you can use, then you're all set.

Before you can send requests to the CalDAV API, you must register
your client with the [Google API Console](https://console.cloud.google.com/) by creating a project.

Go to the [Google API Console](https://console.cloud.google.com/project). Click **Create project**,
enter a name, and click **Create**.

The next step is to activate **CalDAV API**.

To enable an API for your project, do the following:

1. [Open the API Library](https://console.cloud.google.com/apis/library) in the Google API Console. If prompted, select a
   project or create a new one. The API Library lists all available
   APIs, grouped by product family and popularity.
2. If the API you want to enable isn't visible in the list, use search to
   find it.
3. Select the API you want to enable, then click the **Enable**
   button.
4. If prompted, enable billing.
5. If prompted, accept the API's Terms of Service.

To perform **CalDAV API** requests you will need
**Client ID** and **Client Secret**.

To find your project's client ID and client secret, do the following:

1. Select an existing OAuth 2.0 credential or open the [Credentials page](https://console.cloud.google.com/apis/credentials).
2. If you haven't done so already, create your project's OAuth 2.0
   credentials by clicking **Create credentials > OAuth client ID**, and
   providing the information needed to create the credentials.
3. Look for the **Client ID** in the **OAuth 2.0 client IDs** section.
   For details, click the client ID.

## Connecting to Google's CalDAV server

To use the CalDAV interface, a client program initially connects with the
calendar server at one of two starting points. In either case, the connection
must be made over HTTPS and must use the [OAuth 2.0](/workspace/calendar/auth)
authentication scheme. The CalDAV server will refuse to authenticate a request
unless it arrives over HTTPS with OAuth 2.0 authentication of a Google account.
Attempting to connect over HTTP or using Basic Authentication results in an HTTP
`401 Unauthorized` status code.

If the client program (such as Apple's Calendar app) requires a
principal collection as the starting point, the URI to connect to is:

```
https://apidata.googleusercontent.com/caldav/v2/calid/user
```

Where `calid` should be replaced by the
"calendar ID" of the calendar to be accessed. This can be found through the
Google Calendar web interface as follows: in the pull-down menu next to the
calendar name, select **Calendar Settings**. On the resulting page
the calendar ID is shown in a section labeled **Calendar
Address**. The calendar ID for a user's primary calendar is the same as
that user's email address.

If a client program (such as
[Mozilla Sunbird](http://www.mozilla.org/projects/calendar/sunbird/)) requires a
calendar collection as the starting point, the URI to connect to is:

```
https://apidata.googleusercontent.com/caldav/v2/calid/events
```

The old endpoint **https://www.google.com/calendar/dav** is
deprecated and no longer supported; use it at your own risk.
We recommend you transition to the new endpoint format described above.

iCal® is a trademark of Apple Inc.




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/v3/reference/calendarList/list

Send feedback

# CalendarList: list Stay organized with collections Save and categorize content based on your preferences.

**Note:**
Requires [authorization](#auth).

Returns the calendars on the user's calendar list.
[Try it now](#try-it).

## Request

### HTTP request

```
GET https://www.googleapis.com/calendar/v3/users/me/calendarList
```

### Parameters

| Parameter name | Value | Description |
| --- | --- | --- |
| **Optional query parameters** | | |
| `maxResults` | `integer` | Maximum number of entries returned on one result page. By default the value is 100 entries. The page size can never be larger than 250 entries. Optional. |
| `minAccessRole` | `string` | The minimum access role for the user in the returned entries. Optional. The default is no restriction.   Acceptable values are:  * "`freeBusyReader`": The user can read free/busy information. * "`owner`": The user can read and modify events and access control lists. * "`reader`": The user can read events that are not private. * "`writer`": The user can read and modify events. |
| `pageToken` | `string` | Token specifying which result page to return. Optional. |
| `showDeleted` | `boolean` | Whether to include deleted calendar list entries in the result. Optional. The default is False. |
| `showHidden` | `boolean` | Whether to show hidden entries. Optional. The default is False. |
| `syncToken` | `string` | Token obtained from the `nextSyncToken` field returned on the last page of results from the previous list request. It makes the result of this list request contain only entries that have changed since then. If only read-only fields such as calendar properties or ACLs have changed, the entry won't be returned. All entries deleted and hidden since the previous list request will always be in the result set and it is not allowed to set `showDeleted` neither `showHidden` to False.  To ensure client state consistency `minAccessRole` query parameter cannot be specified together with `nextSyncToken`.  If the `syncToken` expires, the server will respond with a 410 GONE response code and the client should clear its storage and perform a full synchronization without any `syncToken`.  [Learn more](/workspace/calendar/api/guides/sync) about incremental synchronization.  Optional. The default is to return all entries. |

### Authorization

This request requires authorization with at least one of the following scopes:

| Scope |
| --- |
| `https://www.googleapis.com/auth/calendar.readonly` |
| `https://www.googleapis.com/auth/calendar` |
| `https://www.googleapis.com/auth/calendar.calendarlist` |
| `https://www.googleapis.com/auth/calendar.calendarlist.readonly` |

For more information, see the [authentication and authorization](/workspace/guides/configure-oauth-consent) page.

### Request body

Do not supply a request body with this method.

## Response

If successful, this method returns a response body with the following structure:

```
{
  "kind": "calendar#calendarList",
  "etag": etag,
  "nextPageToken": string,
  "nextSyncToken": string,
  "items": [
    calendarList Resource
  ]
}
```

| Property name | Value | Description | Notes |
| --- | --- | --- | --- |
| `kind` | `string` | Type of the collection ("`calendar#calendarList`"). |  |
| `etag` | `etag` | ETag of the collection. |  |
| `nextPageToken` | `string` | Token used to access the next page of this result. Omitted if no further results are available, in which case `nextSyncToken` is provided. |  |
| `items[]` | `list` | Calendars that are present on the user's calendar list. |  |
| `nextSyncToken` | `string` | Token used at a later point in time to retrieve only the entries that have changed since this result was returned. Omitted if further results are available, in which case `nextPageToken` is provided. |  |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/v3/reference/calendarList/get

Send feedback

# CalendarList: get Stay organized with collections Save and categorize content based on your preferences.

**Note:**
Requires [authorization](#auth).

Returns a calendar from the user's calendar list.
[Try it now](#try-it).

## Request

### HTTP request

```
GET https://www.googleapis.com/calendar/v3/users/me/calendarList/calendarId
```

### Parameters

| Parameter name | Value | Description |
| --- | --- | --- |
| **Path parameters** | | |
| `calendarId` | `string` | Calendar identifier. To retrieve calendar IDs call the [calendarList.list](/workspace/calendar/api/v3/reference/calendarList/list) method. If you want to access the primary calendar of the currently logged in user, use the "`primary`" keyword. |

### Authorization

This request requires authorization with at least one of the following scopes:

| Scope |
| --- |
| `https://www.googleapis.com/auth/calendar.readonly` |
| `https://www.googleapis.com/auth/calendar` |
| `https://www.googleapis.com/auth/calendar.app.created` |
| `https://www.googleapis.com/auth/calendar.calendarlist` |
| `https://www.googleapis.com/auth/calendar.calendarlist.readonly` |

For more information, see the [authentication and authorization](/workspace/guides/configure-oauth-consent) page.

### Request body

Do not supply a request body with this method.

## Response

If successful, this method returns a [CalendarList resource](/workspace/calendar/api/v3/reference/calendarList#resource) in the response body.




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/api/concepts/reminders

Send feedback

# Reminders & notifications Stay organized with collections Save and categorize content based on your preferences.

The Calendar API provides support for reminders and notifications.

* *Reminders* are alarms triggered at a specified time before an event starts.
* *Notifications* allow users to find out about changes to events in their calendar.

The latter item should not be confused with [push
notifications](/workspace/calendar/v3/push) which, instead of being delivered
to a user, notify another server of changes to a calendar.

> For more details about notifications in Google Calendar, go to
> [Modify Google Calendar notifications](https://support.google.com/calendar/answer/37242).

## Reminders

A reminder consists of:

* When to show the reminder, expressed as minutes before the event start time
* The delivery method to use (see [Delivery mechanisms](/workspace/calendar/concepts/reminders#delivery_mechanisms))

Reminders can be specified for whole calendars and for individual events. Users
can set *default reminders* for each of their calendars; these defaults apply to
all events within that calendar. However, users can also override these
defaults for individual events, replacing them with a different set of
reminders.

### Default reminders

Reminders are private information, specific to an authenticated user; they're
*not* shared across multiple users. As a result:

* Default reminders are manipulated through the CalendarList collection, which
  contains user-specific calendar metadata
* They're *not* accessible through the Calendars collection, which contains global
  metadata shared across all users.

Default reminders are also returned when doing an Events list query.

### Overriding default reminders

To override the default reminders when you insert or modify an event, set
[reminders.useDefault](/workspace/calendar/v3/reference/events#reminders.useDefault)
to `false` and populate
[reminders.overrides](/workspace/calendar/v3/reference/events#reminders.overrides)
with the new reminder set.

```
"reminders": {
  "useDefault": false,
  # Overrides can be set if and only if useDefault is false.
  "overrides": [
      {
        "method": "reminderMethod",
        "minutes": "reminderMinutes"
      },
      # ...
  ]
}
```

To revert to the default set of reminders, perform an update setting
[reminders.useDefault](/workspace/calendar/v3/reference/events#reminders.useDefault)
back to `true`.

## Notifications

Calendar supports the following notification types:

* *Event creation*: a new event is added to one of the user's calendars.
* *Event change*: the organizer modified an event the user was invited to.
* *Event cancellation*: an event is canceled the user was invited to.
* *Attendee response*: an attendee to an event created by the user changed their response status.
* *Agenda*: a list of all the events in the user’s calendar, sent at the start of the day.

The user can decide what notifications to enable per calendar and the delivery
method for each notification type. These settings are not shared with other
users. Similar to default reminders, they’re accessible through the
CalendarList collection.

To send email notifications to attendees for events that were inserted or
updated with the API, call the
[`insert`](/workspace/calendar/api/v3/reference/events/insert) or
[`update`](/workspace/calendar/api/v3/reference/events/update) method and set
the `sendUpdates` parameter to `"all"` or `"externalOnly"`.

**Note:** For attendees with non-Google email addresses, these notification emails
are the only way they can find out about the event; it's not added to their
calendars automatically.

## Delivery mechanisms

The delivery methods offered by Google Calendar are:

* *Pop-up*. These are supported on mobile platforms and on web clients.
* *Email* sent by the server.

The following table shows the supported methods for each reminder or notification type:

|  |  | Pop-up | Email |
| --- | --- | --- | --- |
| **Reminders** | Default reminders | ✓ | ✓ |
| Override reminders | ✓ | ✓ |
| **Notifications** | Event creation | ❌ | ✓ |
| Event change | ❌ | ✓ |
| Event cancellation | ❌ | ✓ |
| Attendee response | ❌ | ✓ |
| Agenda | ❌ | ✓ |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/v3/push

Send feedback

# Push notifications Stay organized with collections Save and categorize content based on your preferences.

This document describes how to use push notifications that inform your
application when a resource changes.

## Overview

The Google Calendar API provides push notifications that let you monitor
changes in resources. You can use this feature to improve the performance of
your application. It lets you eliminate the extra network and compute
costs involved with polling resources to determine if they have changed.
Whenever a watched resource changes, the Google Calendar API notifies your
application.

To use push notifications, you must do two things:

* Set up your receiving URL or "webhook" callback receiver.

  This
  is an HTTPS server that handles the API notification messages that are
  triggered when a resource changes.
* Set up a ([notification channel](https://cloud.google.com/monitoring/support/notification-options)) for each resource endpoint you want to
  watch.

  A channel specifies routing information for notification
  messages. As part of the channel setup, you must identify the specific URL where
  you want to receive notifications. Whenever a channel's resource changes,
  the Google Calendar API sends a notification message as a `POST`
  request to that URL.

Currently, the Google Calendar API supports notifications for changes to
the [Acl](/workspace/calendar/v3/reference/acl/watch), [CalendarList](/workspace/calendar/v3/reference/calendarList/watch), [Events](/workspace/calendar/v3/reference/events/watch), and [Settings](/workspace/calendar/v3/reference/settings/watch) resources.

## Create notification channels

To request push notifications, you must set up a notification channel
for each resource you want to monitor. After your notification channels are set
up, the Google Calendar API informs your application when any watched resource
changes.

### Make watch requests

Each watchable Google Calendar API resource has an associated
`watch` method at a URI of the following form:

```
https://www.googleapis.com/API_NAME/API_VERSION/RESOURCE_PATH/watch
```

To set up a notification channel for messages about changes to a
particular resource, send a `POST` request to the
`watch` method for the resource.

Each notification channel is associated both with a particular user and
a particular resource (or set of resources). A `watch` request
won't be successful unless the current user
owns or has permission to access this resource.

#### Example

Start watching for changes to a collection of events on a given calendar:

```
POST https://www.googleapis.com/calendar/v3/calendars/my_calendar@gmail.com/events/watch
Authorization: Bearer auth_token_for_current_user
Content-Type: application/json

{
  "id": "01234567-89ab-cdef-0123456789ab", // Your channel ID.
  "type": "web_hook",
  "address": "https://mydomain.com/notifications", // Your receiving URL.
  ...
  "token": "target=myApp-myCalendarChannelDest", // (Optional) Your channel token.
  "expiration": 1426325213000 // (Optional) Your requested channel expiration time.
}
```

#### Required properties

With each `watch` request, you must provide these fields:

* An `id` property string that uniquely identifies this
  new notification channel within your project. We recommend using
  a universally unique identifier
  ([UUID](http://en.wikipedia.org/wiki/UUID)) or any similar
  unique string. Maximum length: 64 characters.

  The ID value you set is echoed back in the
  `X-Goog-Channel-Id` HTTP header of every notification
  message that you receive for this channel.
* A `type` property string set to the value
  `web_hook`.
* An `address` property string set to the URL that listens
  and responds to notifications for this notification channel. This is
  your webhook callback URL, and it must use HTTPS.

  Note that the Google Calendar API is able to send notifications to
  this HTTPS address only if there's a valid SSL certificate installed
  on your web server. Invalid certificates include:

  + Self-signed certificates.
  + Certificates signed by an untrusted source.
  + Certificates that have been revoked.
  + Certificates that have a subject that doesn't match the target
    hostname.

#### Optional properties

You can also specify these optional fields with your
`watch` request:

* A `token` property that specifies an arbitrary string
  value to use as a channel token. You can use notification channel
  tokens for various purposes. For example, you can use the
  token to verify that each incoming message is for a channel that your
  application created—to ensure that the notification is not being
  spoofed—or to route the message to the right destination within
  your application based on the purpose of this channel. Maximum length:
  256 characters.

  The token is included in the
  `X-Goog-Channel-Token` HTTP header in every notification
  message that your application receives for this channel.

  If you use notification channel tokens, we recommend that you:

  + Use an extensible encoding format, such as URL query
    parameters. Example: `forwardTo=hr&createdBy=mobile`
  + Don't include sensitive data such as OAuth tokens.**Note:** If you must send highly-sensitive
  data, make sure it's encrypted before adding it to the
  token.
* An `expiration` property string set to a
  [Unix timestamp](http://en.wikipedia.org/wiki/Unix_time)
  (in milliseconds) of the date and time when you want the Google Calendar API to
  stop sending messages for this notification channel.

  If a channel has an expiration time, it's included as the value
  of the `X-Goog-Channel-Expiration` HTTP header (in human-readable
  format) in every notification message that your
  application receives for this channel.

For more details on the request, refer to the `watch` method
for the [Acl](/workspace/calendar/v3/reference/acl/watch), [CalendarList](/workspace/calendar/v3/reference/calendarList/watch), [Events](/workspace/calendar/v3/reference/events/watch), and [Settings](/workspace/calendar/v3/reference/settings/watch) resources in the API Reference.

#### Watch response

If the `watch` request successfully creates a notification
channel, it returns an HTTP `200 OK` status code.

The message body of the watch response provides information about the
notification channel you just created, as shown in the example below.

```
{
  "kind": "api#channel",
  "id": "01234567-89ab-cdef-0123456789ab"", // ID you specified for this channel.
  "resourceId": "o3hgv1538sdjfh", // ID of the watched resource.
  "resourceUri": "https://www.googleapis.com/calendar/v3/calendars/my_calendar@gmail.com/events", // Version-specific ID of the watched resource.
  "token": "target=myApp-myCalendarChannelDest", // Present only if one was provided.
  "expiration": 1426325213000, // Actual expiration time as Unix timestamp (in ms), if applicable.
}
```

In addition to the properties you sent as part of your request, the
returned information also includes the `resourceId` and
`resourceUri` to identify the resource being watched on this
notification channel.

**Note:** The `resourceId` property is a
stable, version-independent identifier for the resource. The
`resourceUri` property is the canonical URI of the watched
resource in the context of the current API version, so it's
version-specific.

You can pass the returned information to other notification channel
operations, such as when you want to [stop receiving
notifications](#stopping).

For more details on the response, refer to the `watch`
method for the [Acl](/workspace/calendar/v3/reference/acl/watch), [CalendarList](/workspace/calendar/v3/reference/calendarList/watch), [Events](/workspace/calendar/v3/reference/events/watch), and [Settings](/workspace/calendar/v3/reference/settings/watch) resources in the API Reference.

#### Sync message

After creating a notification channel to watch a resource, the
Google Calendar API sends a `sync` message to indicate that
notifications are starting. The `X-Goog-Resource-State` HTTP
header value for these messages is `sync`. Due to network
timing issues, it's possible to receive the `sync` message
even before you receive the `watch` method response.

It's safe to ignore the `sync` notification, but you can
also use it. For example, if you decide you don't want to keep
the channel, you can use the `X-Goog-Channel-ID` and
`X-Goog-Resource-ID` values in a call to
[stop receiving notifications](#stopping). You can also use the
`sync` notification to do some initialization to prepare for
later events.

The format of `sync` messages the Google Calendar API sends to
your receiving URL is shown below.

```
POST https://mydomain.com/notifications // Your receiving URL.
X-Goog-Channel-ID: channel-ID-value
X-Goog-Channel-Token: channel-token-value
X-Goog-Channel-Expiration: expiration-date-and-time // In human-readable format. Present only if the channel expires.
X-Goog-Resource-ID: identifier-for-the-watched-resource
X-Goog-Resource-URI: version-specific-URI-of-the-watched-resource
X-Goog-Resource-State: sync
X-Goog-Message-Number: 1
```

Sync messages always have an `X-Goog-Message-Number` HTTP
header value of `1`. Each subsequent notification for this channel has
a message number that's larger than the previous one, though the message
numbers will not be sequential.

### Renew notification channels

A notification channel can have an expiration time, with a value
determined either by your request or by any Google Calendar API internal limits
or defaults (the more restrictive value is used). The channel's expiration
time, if it has one, is included as a [Unix timestamp](http://en.wikipedia.org/wiki/Unix_time)
(in milliseconds) in the information returned by the `watch` method. In addition, the
expiration date and time is included (in human-readable format) in every
notification message your application receives for this channel in the
`X-Goog-Channel-Expiration` HTTP header.

Currently, there's no automatic way to renew a notification channel. When
a channel is close to its expiration, you must replace it with a new one by calling
the `watch` method. As always, you must use a unique value for
the `id` property of the new channel. Note that there's likely
to be an "overlap" period of time when the two notification channels for the
same resource are active.

## Receive notifications

Whenever a watched resource changes, your application receives a
notification message describing the change. The Google Calendar API sends these
messages as HTTPS `POST` requests to the URL you specified as the
[`address` property](#address_prop) for this notification
channel.

**Note:** Notification delivery HTTPS requests
specify a user agent of `APIs-Google` and respect robots.txt
directives, as described in [APIs Google
User Agent](/search/docs/crawling-indexing/apis-user-agent).

### Interpret the notification message format

All notification messages include a set of HTTP headers that have
`X-Goog-` prefixes.
Some types of notifications can also include a
message body.

#### Headers

Notification messages posted by the Google Calendar API to your receiving
URL include the following HTTP headers:

| Header | Description |
| --- | --- |
| **Always present** | |
| `X-Goog-Channel-ID` | UUID or other unique string you provided to identify this notification channel. |
| `X-Goog-Message-Number` | Integer that identifies this message for this notification channel. Value is always `1` for `sync` messages. Message numbers increase for each subsequent message on the channel, but they're not sequential. |
| `X-Goog-Resource-ID` | An opaque value identifying the watched resource. This ID is stable across API versions. |
| `X-Goog-Resource-State` | The new resource state that triggered the notification. Possible values: `sync`, `exists`, or `not_exists`. |
| `X-Goog-Resource-URI` | An API-version-specific identifier for the watched resource. |
| **Sometimes present** | |
| `X-Goog-Channel-Expiration` | Date and time of notification channel expiration, expressed in human-readable format. Only present if defined. |
| `X-Goog-Channel-Token` | Notification channel token that was set by your application, and that you can use to verify the notification source. Only present if defined. |

Notification messages posted by the Google Calendar API to your receiving URL do not include a message body. These messages do not contain specific information about updated resources, you will need to make another API call to see the full change details.

#### Examples

Change notification message for modified collection of events:

```
POST https://mydomain.com/notifications // Your receiving URL.
Content-Type: application/json; utf-8
Content-Length: 0
X-Goog-Channel-ID: 4ba78bf0-6a47-11e2-bcfd-0800200c9a66
X-Goog-Channel-Token: 398348u3tu83ut8uu38
X-Goog-Channel-Expiration: Tue, 19 Nov 2013 01:13:52 GMT
X-Goog-Resource-ID:  ret08u3rv24htgh289g
X-Goog-Resource-URI: https://www.googleapis.com/calendar/v3/calendars/my_calendar@gmail.com/events
X-Goog-Resource-State:  exists
X-Goog-Message-Number: 10
```

### Respond to notifications

To indicate success, you can return any of the following status codes:
`200`, `201`, `202`, `204`, or
`102`.

If your service uses [Google's API client library](/admin-sdk/directory/v1/libraries)
and returns `500`,`502`, `503`, or `504`, the Google Calendar API
retries with [exponential backoff](https://www.google.com/search?q=define%3Aexponential+backoff&oq=define%3Aexponential+backoff).
Every other return status code is considered to be a message failure.

### Understand Google Calendar API notification events

This section provides details on the notification messages you can
receive when using push notifications with the Google Calendar API.

| X-Goog-Resource-State | Applies to | Delivered when |
| --- | --- | --- |
| `sync` | ACLs, Calendar lists, Events, Settings. | A new channel was successfully created. You can expect to start receiving notifications for it. |
| `exists` | ACLs, Calendar lists, Events, Settings. | There was a change to a resource. Possible changes include the creation of a new resource, or the modification or deletion of an existing resource. |

## Stop notifications

The `expiration` property controls when the notifications stop automatically. You can
choose to stop receiving notifications for a particular channel before it
expires by calling the `stop` method at
the following URI:

```
https://www.googleapis.com/calendar/v3/channels/stop
```

This method requires that you provide at least the channel's
`id` and the `resourceId` properties, as shown in the
example below. Note that if the Google Calendar API has several types of
resources that have `watch` methods, there's only one
`stop` method.

Only users with the right permission can stop a channel. In particular:

* If the channel was created by a regular user account, only the same
  user from the same client (as identified by the OAuth 2.0 client IDs from the
  auth tokens) who created the channel can stop the channel.
* If the channel was created by a service account, any user from the same
  client can stop the channel.

The following code sample shows how to stop receiving notifications:

```
POST https://www.googleapis.com/calendar/v3/channels/stop
  
Authorization: Bearer CURRENT_USER_AUTH_TOKEN
Content-Type: application/json

{
  "id": "4ba78bf0-6a47-11e2-bcfd-0800200c9a66",
  "resourceId": "ret08u3rv24htgh289g"
}
```

#### Special considerations

When working with push notifications, keep the following in mind:

**Events and ACLs are per-calendar** If you want to get notified about all event or ACL changes for calendars A and B, you need to separately subscribe to the events/ACL collections for A and for B.

**Settings and calendar lists are per-user** Settings and calendar lists only have one collection per user, so you can subscribe just once.

Also, you won’t be notified when you gain access to a new collection (for example, a new calendar) although you *will* be notified if that calendar is added to the calendar list (assuming you are subscribed to the calendar list collection).

Notifications are not 100% reliable. Expect a small percentage of messages to get dropped under normal working conditions. Make sure to handle these
missing messages gracefully, so that the application still syncs even if no push messages are received.




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/v3/reference/calendarList/watch

Send feedback

# CalendarList: watch Stay organized with collections Save and categorize content based on your preferences.

**Note:**
Requires [authorization](#auth).

Watch for changes to CalendarList resources.

## Request

### HTTP request

```
POST https://www.googleapis.com/calendar/v3/users/me/calendarList/watch
```

### Parameters

| Parameter name | Value | Description |
| --- | --- | --- |

### Authorization

This request requires authorization with at least one of the following scopes:

| Scope |
| --- |
| `https://www.googleapis.com/auth/calendar.readonly` |
| `https://www.googleapis.com/auth/calendar` |
| `https://www.googleapis.com/auth/calendar.calendarlist` |
| `https://www.googleapis.com/auth/calendar.calendarlist.readonly` |

For more information, see the [authentication and authorization](/workspace/guides/configure-oauth-consent) page.

### Request body

In the request body, supply data with the following structure:

```
{
  "id": string,
  "token": string,
  "type": string,
  "address": string,
  "params": {
    "ttl": string
  }
}
```

| Property name | Value | Description | Notes |
| --- | --- | --- | --- |
| `id` | `string` | A UUID or similar unique string that identifies this channel. |  |
| `token` | `string` | An arbitrary string delivered to the target address with each notification delivered over this channel. Optional. |  |
| `type` | `string` | The type of delivery mechanism used for this channel. Valid values are "`web_hook`" (or "`webhook`"). Both values refer to a channel where Http requests are used to deliver messages. |  |
| `address` | `string` | The address where notifications are delivered for this channel. |  |
| `params` | `object` | Additional parameters controlling delivery channel behavior. Optional. |  |
| `params.ttl` | `string` | The time-to-live in seconds for the notification channel. Default is 604800 seconds. |  |

## Response

If successful, this method returns a response body with the following structure:

```
{
  "kind": "api#channel",
  "id": string,
  "resourceId": string,
  "resourceUri": string,
  "token": string,
  "expiration": long
}
```

| Property name | Value | Description | Notes |
| --- | --- | --- | --- |
| `kind` | `string` | Identifies this as a notification channel used to watch for changes to a resource, which is "`api#channel`". |  |
| `id` | `string` | A UUID or similar unique string that identifies this channel. |  |
| `resourceId` | `string` | An opaque ID that identifies the resource being watched on this channel. Stable across different API versions. |  |
| `resourceUri` | `string` | A version-specific identifier for the watched resource. |  |
| `token` | `string` | An arbitrary string delivered to the target address with each notification delivered over this channel. Optional. |  |
| `expiration` | `long` | Date and time of notification channel expiration, expressed as a Unix timestamp, in milliseconds. Optional. |  |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/v3/reference/events/instances

Send feedback

# Events: instances Stay organized with collections Save and categorize content based on your preferences.

**Note:**
[Authorization](#auth) optional.

Returns instances of the specified recurring event.
[Try it now](#try-it).

## Request

### HTTP request

```
GET https://www.googleapis.com/calendar/v3/calendars/calendarId/events/eventId/instances
```

### Parameters

| Parameter name | Value | Description |
| --- | --- | --- |
| **Path parameters** | | |
| `calendarId` | `string` | Calendar identifier. To retrieve calendar IDs call the [calendarList.list](/workspace/calendar/api/v3/reference/calendarList/list) method. If you want to access the primary calendar of the currently logged in user, use the "`primary`" keyword. |
| `eventId` | `string` | Recurring event identifier. |
| **Optional query parameters** | | |
| `alwaysIncludeEmail` | `boolean` | Deprecated and ignored. A value will always be returned in the `email` field for the organizer, creator and attendees, even if no real email address is available (i.e. a generated, non-working value will be provided). |
| `maxAttendees` | `integer` | The maximum number of attendees to include in the response. If there are more than the specified number of attendees, only the participant is returned. Optional. |
| `maxResults` | `integer` | Maximum number of events returned on one result page. By default the value is 250 events. The page size can never be larger than 2500 events. Optional. |
| `originalStart` | `string` | The original start time of the instance in the result. Optional. |
| `pageToken` | `string` | Token specifying which result page to return. Optional. |
| `showDeleted` | `boolean` | Whether to include deleted events (with `status` equals "`cancelled`") in the result. Cancelled instances of recurring events will still be included if `singleEvents` is False. Optional. The default is False. |
| `timeMax` | `datetime` | Upper bound (exclusive) for an event's start time to filter by. Optional. The default is not to filter by start time. Must be an RFC3339 timestamp with mandatory time zone offset. |
| `timeMin` | `datetime` | Lower bound (inclusive) for an event's end time to filter by. Optional. The default is not to filter by end time. Must be an RFC3339 timestamp with mandatory time zone offset. |
| `timeZone` | `string` | Time zone used in the response. Optional. The default is the time zone of the calendar. |

### Authorization

This request allows authorization with at least one of the following scopes:

| Scope |
| --- |
| `https://www.googleapis.com/auth/calendar.readonly` |
| `https://www.googleapis.com/auth/calendar` |
| `https://www.googleapis.com/auth/calendar.events.readonly` |
| `https://www.googleapis.com/auth/calendar.events` |
| `https://www.googleapis.com/auth/calendar.app.created` |
| `https://www.googleapis.com/auth/calendar.events.freebusy` |
| `https://www.googleapis.com/auth/calendar.events.owned` |
| `https://www.googleapis.com/auth/calendar.events.owned.readonly` |
| `https://www.googleapis.com/auth/calendar.events.public.readonly` |

For more information, see the [authentication and authorization](/workspace/guides/configure-oauth-consent) page.

### Request body

Do not supply a request body with this method.

## Response

If successful, this method returns a response body with the following structure:

```
{
  "kind": "calendar#events",
  "etag": etag,
  "summary": string,
  "description": string,
  "updated": datetime,
  "timeZone": string,
  "accessRole": string,
  "defaultReminders": [
    {
      "method": string,
      "minutes": integer
    }
  ],
  "nextPageToken": string,
  "nextSyncToken": string,
  "items": [
    events Resource
  ]
}
```

| Property name | Value | Description | Notes |
| --- | --- | --- | --- |
| `kind` | `string` | Type of the collection ("`calendar#events`"). |  |
| `etag` | `etag` | ETag of the collection. |  |
| `summary` | `string` | Title of the calendar. Read-only. |  |
| `description` | `string` | Description of the calendar. Read-only. |  |
| `updated` | `datetime` | Last modification time of the calendar (as a [RFC3339](https://tools.ietf.org/html/rfc3339) timestamp). Read-only. |  |
| `timeZone` | `string` | The time zone of the calendar. Read-only. |  |
| `accessRole` | `string` | The user's access role for this calendar. Read-only. Possible values are:  * "`none`" - The user has no access. * "`freeBusyReader`" - The user has read access to free/busy information. * "`reader`" - The user has read access to the calendar. Private events will appear to users with reader access, but event details will be hidden. * "`writer`" - The user has read and write access to the calendar. Private events will appear to users with writer access, and event details will be visible. * "`owner`" - The user has manager access to the calendar. This role has all of the permissions of the writer role with the additional ability to see and modify access levels of other users.  Important: the `owner` role is different from the calendar's data owner. A calendar has a single data owner, but can have multiple users with `owner` role. |  |
| `defaultReminders[]` | `list` | The default reminders on the calendar for the authenticated user. These reminders apply to all events on this calendar that do not explicitly override them (i.e. do not have `reminders.useDefault` set to True). |  |
| `defaultReminders[].method` | `string` | The method used by this reminder. Possible values are:  * "`email`" - Reminders are sent via email. * "`popup`" - Reminders are sent via a UI popup.   Required when adding a reminder. | writable |
| `defaultReminders[].minutes` | `integer` | Number of minutes before the start of the event when the reminder should trigger. Valid values are between 0 and 40320 (4 weeks in minutes). Required when adding a reminder. | writable |
| `nextPageToken` | `string` | Token used to access the next page of this result. Omitted if no further results are available, in which case `nextSyncToken` is provided. |  |
| `items[]` | `list` | List of events on the calendar. |  |
| `nextSyncToken` | `string` | Token used at a later point in time to retrieve only the entries that have changed since this result was returned. Omitted if further results are available, in which case `nextPageToken` is provided. |  |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/concepts/reminders

Send feedback

# Reminders & notifications Stay organized with collections Save and categorize content based on your preferences.

The Calendar API provides support for reminders and notifications.

* *Reminders* are alarms triggered at a specified time before an event starts.
* *Notifications* allow users to find out about changes to events in their calendar.

The latter item should not be confused with [push
notifications](/workspace/calendar/v3/push) which, instead of being delivered
to a user, notify another server of changes to a calendar.

> For more details about notifications in Google Calendar, go to
> [Modify Google Calendar notifications](https://support.google.com/calendar/answer/37242).

## Reminders

A reminder consists of:

* When to show the reminder, expressed as minutes before the event start time
* The delivery method to use (see [Delivery mechanisms](/workspace/calendar/concepts/reminders#delivery_mechanisms))

Reminders can be specified for whole calendars and for individual events. Users
can set *default reminders* for each of their calendars; these defaults apply to
all events within that calendar. However, users can also override these
defaults for individual events, replacing them with a different set of
reminders.

### Default reminders

Reminders are private information, specific to an authenticated user; they're
*not* shared across multiple users. As a result:

* Default reminders are manipulated through the CalendarList collection, which
  contains user-specific calendar metadata
* They're *not* accessible through the Calendars collection, which contains global
  metadata shared across all users.

Default reminders are also returned when doing an Events list query.

### Overriding default reminders

To override the default reminders when you insert or modify an event, set
[reminders.useDefault](/workspace/calendar/v3/reference/events#reminders.useDefault)
to `false` and populate
[reminders.overrides](/workspace/calendar/v3/reference/events#reminders.overrides)
with the new reminder set.

```
"reminders": {
  "useDefault": false,
  # Overrides can be set if and only if useDefault is false.
  "overrides": [
      {
        "method": "reminderMethod",
        "minutes": "reminderMinutes"
      },
      # ...
  ]
}
```

To revert to the default set of reminders, perform an update setting
[reminders.useDefault](/workspace/calendar/v3/reference/events#reminders.useDefault)
back to `true`.

## Notifications

Calendar supports the following notification types:

* *Event creation*: a new event is added to one of the user's calendars.
* *Event change*: the organizer modified an event the user was invited to.
* *Event cancellation*: an event is canceled the user was invited to.
* *Attendee response*: an attendee to an event created by the user changed their response status.
* *Agenda*: a list of all the events in the user’s calendar, sent at the start of the day.

The user can decide what notifications to enable per calendar and the delivery
method for each notification type. These settings are not shared with other
users. Similar to default reminders, they’re accessible through the
CalendarList collection.

To send email notifications to attendees for events that were inserted or
updated with the API, call the
[`insert`](/workspace/calendar/api/v3/reference/events/insert) or
[`update`](/workspace/calendar/api/v3/reference/events/update) method and set
the `sendUpdates` parameter to `"all"` or `"externalOnly"`.

**Note:** For attendees with non-Google email addresses, these notification emails
are the only way they can find out about the event; it's not added to their
calendars automatically.

## Delivery mechanisms

The delivery methods offered by Google Calendar are:

* *Pop-up*. These are supported on mobile platforms and on web clients.
* *Email* sent by the server.

The following table shows the supported methods for each reminder or notification type:

|  |  | Pop-up | Email |
| --- | --- | --- | --- |
| **Reminders** | Default reminders | ✓ | ✓ |
| Override reminders | ✓ | ✓ |
| **Notifications** | Event creation | ❌ | ✓ |
| Event change | ❌ | ✓ |
| Event cancellation | ❌ | ✓ |
| Attendee response | ❌ | ✓ |
| Agenda | ❌ | ✓ |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/v3/reference/events/patch

Send feedback

# Events: patch Stay organized with collections Save and categorize content based on your preferences.

**Note:**
Requires [authorization](#auth).

Updates an event. This method supports patch semantics. Note that each patch request consumes three quota units; prefer using a `get` followed by an `update`. The field values you specify replace the existing values. Fields that you don't specify in the request remain unchanged. Array fields, if specified, overwrite the existing arrays; this discards any previous array elements.
[Try it now](#try-it).

## Request

### HTTP request

```
PATCH https://www.googleapis.com/calendar/v3/calendars/calendarId/events/eventId
```

### Parameters

| Parameter name | Value | Description |
| --- | --- | --- |
| **Path parameters** | | |
| `calendarId` | `string` | Calendar identifier. To retrieve calendar IDs call the [calendarList.list](/workspace/calendar/api/v3/reference/calendarList/list) method. If you want to access the primary calendar of the currently logged in user, use the "`primary`" keyword. |
| `eventId` | `string` | Event identifier. |
| **Optional query parameters** | | |
| `alwaysIncludeEmail` | `boolean` | Deprecated and ignored. A value will always be returned in the `email` field for the organizer, creator and attendees, even if no real email address is available (i.e. a generated, non-working value will be provided). |
| `conferenceDataVersion` | `integer` | Version number of conference data supported by the API client. Version 0 assumes no conference data support and ignores conference data in the event's body. Version 1 enables support for copying of ConferenceData as well as for creating new conferences using the createRequest field of conferenceData. The default is 0. Acceptable values are `0` to `1`, inclusive. |
| `maxAttendees` | `integer` | The maximum number of attendees to include in the response. If there are more than the specified number of attendees, only the participant is returned. Optional. |
| `sendNotifications` | `boolean` | Deprecated. Please use [sendUpdates](/workspace/calendar/api/v3/reference/events/update#sendUpdates) instead.  Whether to send notifications about the event update (for example, description changes, etc.). Note that some emails might still be sent even if you set the value to `false`. The default is `false`. |
| `sendUpdates` | `string` | Guests who should receive notifications about the event update (for example, title changes, etc.).   Acceptable values are:  * "`all`": Notifications are sent to all guests. * "`externalOnly`": Notifications are sent to non-Google Calendar guests only. * "`none`": No notifications are sent. For calendar migration tasks, consider using the [Events.import](/workspace/calendar/api/v3/reference/events/import) method instead. |
| `supportsAttachments` | `boolean` | Whether API client performing operation supports event attachments. Optional. The default is False. |

### Authorization

This request requires authorization with at least one of the following scopes:

| Scope |
| --- |
| `https://www.googleapis.com/auth/calendar` |
| `https://www.googleapis.com/auth/calendar.events` |
| `https://www.googleapis.com/auth/calendar.app.created` |
| `https://www.googleapis.com/auth/calendar.events.owned` |

For more information, see the [authentication and authorization](/workspace/guides/configure-oauth-consent) page.

### Request body

In the request body, supply the relevant portions of an [Events resource](/workspace/calendar/api/v3/reference/events#resource), according to the rules of patch semantics.

## Response

If successful, this method returns an [Events resource](/workspace/calendar/api/v3/reference/events#resource) in the response body.




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/release-notes

Send feedback

# Google Calendar API release notes Stay organized with collections Save and categorize content based on your preferences.

To get the latest product updates delivered to you, add the URL of this page to your
[feed
reader](https://wikipedia.org/wiki/Comparison_of_feed_aggregators), or add the feed URL directly: `https://developers.google.com/feeds/calendar-release-notes.xml`.

This page contains release notes for features and updates to the
Calendar API. We recommend that
Calendar API developers periodically check this list for any new
announcements.

## October 27, 2025

Feature

**Generally available starting November 10, 2025**:

Secondary calendars will now have a single data owner. This applies to both existing and newly created calendars. In the Calendar API, the data owner's email address will be in the read-only `dataOwner` field in the `Calendars` and `CalendarList` resources.

To prevent unintended actions and undesired states, the following new restrictions apply:

* Only the data owner can delete secondary calendars.
* The data owner's access level cannot be changed from the default `owner` access.
* The data owner cannot remove an owned calendar from their calendar list. They can hide it from their UI.

When a new secondary calendar is created, the authenticated user that makes the request is the data owner. We recommend that you use user authentication to create secondary calendars. Data ownership can be transferred in the Google Calendar UI.

For more details, see the documentation for [`Calendars`](https://developers.google.com/workspace/calendar/api/v3/reference/calendars) and [`CalendarList`](https://developers.google.com/workspace/calendar/api/v3/reference/calendarList) closer to November 10.

## November 19, 2024

Feature

You can now access birthday and other special events that are automatically created from Google Contacts using the Calendar API.

Birthday events now have [`birthdayProperties`](https://developers.google.com/calendar/api/v3/reference/events#birthdayProperties) that show birthday-specific event data, such as the type of the special event, whether it's a birthday, an anniversary, or another significant date, and the contact that the event is linked to. You can use the [contact](https://developers.google.com/calendar/api/v3/reference/events#birthdayProperties.contact) as a resource name in the [People API](https://developers.google.com/people) to fetch contact details.

To learn more, see the [developer guide for the birthday event type](https://developers.google.com/calendar/api/guides/event-types#birthday).

## August 05, 2024

Feature

**Generally available starting September 17, 2024:** Create and manage birthdays directly within Google Calendar. Birthdays are exposed in the Calendar API as a new [`eventType`](https://developers.google.com/calendar/api/v3/reference/events#eventType) called `"birthday"` which distinguishes special all-day events with an annual recurrence. Birthday events support a limited set of event properties.

You can filter by the birthday event type using the [`events.list()`](https://developers.google.com/calendar/api/v3/reference/events/list) and [`events.watch()`](https://developers.google.com/calendar/api/v3/reference/events/watch) methods. If no type filters are specified, all event types including birthdays are returned.

To learn more, see our [developer guide about working with the birthday event type](https://developers.google.com/calendar/api/guides/event-types#birthday).

## May 22, 2024

Change

The following changes to [events from Gmail](https://support.google.com/calendar/answer/6084018) take effect on **May 30, 2024**:

* Events from Gmail use `fromGmail` instead `default` as the value for the [`eventType`](https://developers.google.com/calendar/api/v3/reference/events/watch#eventTypes) field. You can filter by this new event type using the [`events.list()`](https://developers.google.com/calendar/api/v3/reference/events/list) and [`events.watch()`](https://developers.google.com/calendar/api/v3/reference/events/watch) methods.
* Events from Gmail use the email address of the email recipient as the event organizer instead of `unknownorganizer@calendar.google.com`.
* You can only update the event [properties](https://developers.google.com/calendar/api/v3/reference/events/update#request-body), such as reminders, color ID, visibility, status, and extended properties of `Event` resources with the event type `fromGmail`.

For details, see the Calendar API [`Events` reference documentation](https://developers.google.com/calendar/api/v3/reference/events).

## May 17, 2024

Change

The following change takes effect on **June 3, 2024**:

For [batch operations](https://developers.google.com/calendar/api/guides/batch) on [`Event`](https://developers.google.com/calendar/api/v3/reference/events) resources, a batched item returns an HTTP `409 Conflict` status code if the batch operation can't successfully execute this item due to conflicts with other requested batched items.

**Suggested action:** Exclude all successfully finished and failed batched items and retry remaining items in a different batch operation or by using single event operations.

For more information, see [Handle API errors](https://developers.google.com/calendar/api/guides/errors#409_conflict).

## February 07, 2024

Change

The following changes will take effect on **March 11, 2024**:

* The use of [event type](https://developers.google.com/calendar/api/v3/reference/events/watch#eventTypes) filters will be considered when reviewing quota increase requests. Before you request a quota increase, make sure you specify the event types you need as a parameter for your application.
* Both [`events.list`](https://developers.google.com/calendar/api/v3/reference/events/list) and [`events.watch`](https://developers.google.com/calendar/api/v3/reference/events/watch) will use the same default event type filter.
* To help with error handling, improved error messages will be returned when unsupported operations are attempted on special event types, such as working location, out-of-office, and focus time events.

For more information, refer to the following:

* [Manage focus time, out of office, and working location events](https://developers.google.com/calendar/api/guides/calendar-status#watch-calendar-status)
* [Manage quotas](https://developers.google.com/calendar/api/guides/quota#use_push_notifications)

## February 06, 2024

Announcement

**Generally available**: The `events.watch()` method now supports the `eventTypes` field as a query parameter so that you can subscribe to changes about specific Calendar events, such as working location, out-of-office, or focus time events. For details, see the [reference documentation](https://developers.google.com/calendar/api/v3/reference/events/watch).

## December 07, 2023

Fixed

To fix a bug that prevented events of `eventType != 'default'` from importing, we updated the code sample in [Populate a team vacation calendar](https://developers.google.com/apps-script/samples/automations/vacation-calendar), the popular Apps Script + Calendar API solution. Review the code change in [GitHub](https://github.com/googleworkspace/apps-script-samples/pull/434/files).

## August 17, 2023

Feature

**Generally available**: Reading and updating working locations using the Google Calendar API is now generally available. For details, see [Manage working locations for Google Calendar users](https://developers.google.com/calendar/api/guides/working-hours-and-location).

## August 22, 2022

Feature

**[Developer Preview](https://developers.google.com/workspace/preview)**: The Google Calendar API now supports reading and updating working locations. For details, see [Manage working locations for Google Calendar users](https://developers.google.com/calendar/api/guides/working-hours-and-location).

## March 23, 2022

Feature

The Calendar API now supports custom attachments. See [Calendar add-ons](https://developers.google.com/apps-script/add-ons/calendar) for more information.

## October 20, 2021

Feature

The Calendar API now exposes a new `eventType`. The new type is called `focusTime` and allows users of the API to distinguish the special focus time events. For more information, see the [API reference](https://developers.google.com/calendar/v3/reference/events).

## May 18, 2021

Feature

Two new quotas now exist for the Calendar API in addition to the general [Calendar usage limits](https://support.google.com/a/answer/2905486):

* Per minute per project.
* Per minute per project per user.

See [Manage quotas](https://developers.google.com/calendar/api/guides/quota) for more information.

## February 08, 2021

Feature

You can use the calendarId from the API endpoint `https://www.googleapis.com/calendar/v3/calendars/calendarId` to identify the owner of the out of office event.

Change

Starting today, all existing and new out of office events will be updated to set the organizer to `unknownorganizer@calendar.google.com` instead of the Calendar owner. It may take 2-3 weeks for this change to fully roll out.

## February 01, 2021

Feature

The Calendar API now exposes a new field for events. The new field is called `eventType` and allows users of the API to distinguish special event types, such as `outOfOffice`. For more information, see the [API reference](https://developers.google.com/calendar/v3/reference/events).

## January 11, 2021

Change

From now, we require `conferenceData` to be consistent with `conferenceData.conferenceSolution.key.type`; meaning only Google Meet calls can have `conferenceData.conferenceSolution.key.type` set to `hangoutsMeet`. All 3P video conference providers are expected to set `conferenceData.conferenceSolution.key.type` to `addOn`.

## September 07, 2020

Fixed

Meet video conferences should be added explicitly using the following existing parameters:

1. Set `conferenceDataVersion` query parameter to `1`.
2. Set `conferenceData.createRequest` event property as follows:
   * `conferenceData.createRequest.conferenceSolutionKey.type` to `hangoutsMeet`.
   * `conferenceData.createRequest.requestId` to unique request id.

Change

We stopped auto-populating Meet for API calls (such as `Events.insert`) to prevent Meet conferences being added unintentionally via 3rd parties.

## March 16, 2020

Change

Service accounts created on or after March 2, 2020 are only able to invite guests using [domain-wide delegation of authority](https://developers.google.com/calendar/auth#perform-g-suite-domain-wide-delegation-of-authority).

## September 27, 2019

Feature

The Calendar API allows attaching a conference data of type `addOn` to a new or existing event using `Events.insert` or `Events.update` methods.

## November 19, 2018

Change

Starting on January 7, 2019, notifications and reminders using the `sms` method type will be ignored. The API calls setting such notifications and reminders will still succeed and modify all the other fields.

Since Calendar offers in-app notifications, you can still get notified, regardless of your device or connection. For more information see [Google Calendar SMS notifications to be removed](https://gsuiteupdates.googleblog.com/2018/11/google-calendar-sms-notifications-to-be-removed.html).

## October 31, 2018

Feature

The Calendar API now supports four new OAuth scopes. The scopes allow your application to limit access to only the data you really need. See [Authorizing Google Calendar API Requests](https://developers.google.com/calendar/auth) for more details.

## October 02, 2018

Feature

A more flexible approach to sending event change notifications is now available through the [`sendUpdates` parameter](https://developers.google.com/calendar/v3/reference/events/insert#sendUpdates). The new parameter lets you set event change notifications to do one of the following:

* Notify all the event guests.
* Notify only the guests who are not using Google Calendar.
* Completely suppress the notifications, for example, during a migration.

Now it is possible to always keep in sync guests who use other calendaring systems, without sending too many non-mandatory emails to Google Calendar users.

## March 22, 2018

Deprecated

Support for the [JSON-RPC protocol](http://www.jsonrpc.org/specification) and [Global HTTP batch](https://developers.google.com/api-client-library/javascript/features/batch) endpoints has been deprecated, and will be fully discontinued on March 25, 2019. This change is being made to the Google API infrastructure and as such affects multiple Google APIs, including Calendar v3.

For more information and migration instructions, see the [Discontinuing support for JSON-RPC and Global HTTP Batch Endpoints blog post](https://developers.googleblog.com/2018/03/discontinuing-support-for-json-rpc-and.html).

## July 12, 2017

Feature

Hangouts and Google Meet conferences are now supported in Calendar events via the [`conferenceData` field](https://developers.google.com/calendar/v3/reference/events#conferenceData). You can:

* Read conference data associated with events.
* Copy conference data from one event to another.
* Request new conference generation for an event.
* Clear conference data associated with events.

To learn more, see [Create Events](https://developers.google.com/calendar/create-events#conferencing).




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/v3/reference/events/insert

Send feedback

# Events: insert Stay organized with collections Save and categorize content based on your preferences.

**Note:**
Requires [authorization](#auth).

Creates an event.
[Try it now](#try-it).

## Request

### HTTP request

```
POST https://www.googleapis.com/calendar/v3/calendars/calendarId/events
```

### Parameters

| Parameter name | Value | Description |
| --- | --- | --- |
| **Path parameters** | | |
| `calendarId` | `string` | Calendar identifier. To retrieve calendar IDs call the [calendarList.list](/workspace/calendar/api/v3/reference/calendarList/list) method. If you want to access the primary calendar of the currently logged in user, use the "`primary`" keyword. |
| **Optional query parameters** | | |
| `conferenceDataVersion` | `integer` | Version number of conference data supported by the API client. Version 0 assumes no conference data support and ignores conference data in the event's body. Version 1 enables support for copying of ConferenceData as well as for creating new conferences using the createRequest field of conferenceData. The default is 0. Acceptable values are `0` to `1`, inclusive. |
| `maxAttendees` | `integer` | The maximum number of attendees to include in the response. If there are more than the specified number of attendees, only the participant is returned. Optional. |
| `sendNotifications` | `boolean` | Deprecated. Please use [sendUpdates](/workspace/calendar/api/v3/reference/events/insert#sendUpdates) instead.  Whether to send notifications about the creation of the new event. Note that some emails might still be sent even if you set the value to `false`. The default is `false`. |
| `sendUpdates` | `string` | Whether to send notifications about the creation of the new event. Note that some emails might still be sent. The default is `false`.   Acceptable values are:  * "`all`": Notifications are sent to all guests. * "`externalOnly`": Notifications are sent to non-Google Calendar guests only. * "`none`": No notifications are sent. **Warning:** Using the value `none` can have significant adverse effects, including events not syncing to external calendars or events being lost altogether for some users. For calendar migration tasks, consider using the [events.import](/workspace/calendar/api/v3/reference/events/import) method instead. |
| `supportsAttachments` | `boolean` | Whether API client performing operation supports event attachments. Optional. The default is False. |

### Authorization

This request requires authorization with at least one of the following scopes:

| Scope |
| --- |
| `https://www.googleapis.com/auth/calendar` |
| `https://www.googleapis.com/auth/calendar.events` |
| `https://www.googleapis.com/auth/calendar.app.created` |
| `https://www.googleapis.com/auth/calendar.events.owned` |

For more information, see the [authentication and authorization](/workspace/guides/configure-oauth-consent) page.

### Request body

In the request body, supply an [Events resource](/workspace/calendar/api/v3/reference/events#resource) with the following properties:

| Property name | Value | Description | Notes |
| --- | --- | --- | --- |
| **Required Properties** | | | |
| `end` | `nested object` | The (exclusive) end time of the event. For a recurring event, this is the end time of the first instance. |  |
| `start` | `nested object` | The (inclusive) start time of the event. For a recurring event, this is the start time of the first instance. |  |
| **Optional Properties** | | | |
| `anyoneCanAddSelf` | `boolean` | Whether anyone can invite themselves to the event (deprecated). Optional. The default is False. | writable |
| `attachments[].fileUrl` | `string` | URL link to the attachment. For adding Google Drive file attachments use the same format as in `alternateLink` property of the `Files` resource in the Drive API.  Required when adding an attachment. | writable |
| `attendees[]` | `list` | The attendees of the event. See the [Events with attendees](/calendar/concepts/sharing) guide for more information on scheduling events with other calendar users. Service accounts need to use [domain-wide delegation of authority](/calendar/auth#perform-g-suite-domain-wide-delegation-of-authority) to populate the attendee list. | writable |
| `attendees[].additionalGuests` | `integer` | Number of additional guests. Optional. The default is 0. | writable |
| `attendees[].comment` | `string` | The attendee's response comment. Optional. | writable |
| `attendees[].displayName` | `string` | The attendee's name, if available. Optional. | writable |
| `attendees[].email` | `string` | The attendee's email address, if available. This field must be present when adding an attendee. It must be a valid email address as per [RFC5322](https://tools.ietf.org/html/rfc5322#section-3.4). Required when adding an attendee. | writable |
| `attendees[].optional` | `boolean` | Whether this is an optional attendee. Optional. The default is False. | writable |
| `attendees[].resource` | `boolean` | Whether the attendee is a resource. Can only be set when the attendee is added to the event for the first time. Subsequent modifications are ignored. Optional. The default is False. | writable |
| `attendees[].responseStatus` | `string` | The attendee's response status. Possible values are:  * "`needsAction`" - The attendee has not responded to the invitation (recommended for new events). * "`declined`" - The attendee has declined the invitation. * "`tentative`" - The attendee has tentatively accepted the invitation. * "`accepted`" - The attendee has accepted the invitation.  **Warning:** If you add an event using the values `declined`, `tentative`, or `accepted`, attendees with the "Add invitations to my calendar" setting set to "When I respond to invitation in email" or "Only if the sender is known" might have their response reset to `needsAction` and won't see an event in their calendar unless they change their response in the event invitation email. Furthermore, if more than 200 guests are invited to the event, response status is not propagated to the guests. | writable |
| `birthdayProperties` | `nested object` | Birthday or special event data. Used if `eventType` is `"birthday"`. Immutable. | writable |
| `birthdayProperties.type` | `string` | Type of birthday or special event. Possible values are:  * `"anniversary"` - An anniversary other than birthday. Always has a `contact`. * `"birthday"` - A birthday event. This is the default value. * `"custom"` - A special date whose label is further specified in the `customTypeName` field. Always has a `contact`. * `"other"` - A special date which does not fall into the other categories, and does not have a custom label. Always has a `contact`. * `"self"` - Calendar owner's own birthday. Cannot have a `contact`.  The Calendar API only supports creating events with the type `"birthday"`. The type cannot be changed after the event is created. | writable |
| `colorId` | `string` | The color of the event. This is an ID referring to an entry in the `event` section of the colors definition (see the  [colors endpoint](/calendar/v3/reference/colors)). Optional. | writable |
| `conferenceData` | `nested object` | The conference-related information, such as details of a Google Meet conference. To create new conference details use the `createRequest` field. To persist your changes, remember to set the `conferenceDataVersion` request parameter to `1` for all event modification requests. **Warning:** Reusing Google Meet conference data across different events can cause access issues and expose meeting details to unintended users. To help ensure meeting privacy, always generate a unique conference for each event by using the `createRequest` field. | writable |
| `description` | `string` | Description of the event. Can contain HTML. Optional. | writable |
| `end.date` | `date` | The date, in the format "yyyy-mm-dd", if this is an all-day event. | writable |
| `end.dateTime` | `datetime` | The time, as a combined date-time value (formatted according to [RFC3339](https://tools.ietf.org/html/rfc3339)). A time zone offset is required unless a time zone is explicitly specified in `timeZone`. | writable |
| `end.timeZone` | `string` | The time zone in which the time is specified. (Formatted as an IANA Time Zone Database name, e.g. "Europe/Zurich".) For recurring events this field is required and specifies the time zone in which the recurrence is expanded. For single events this field is optional and indicates a custom time zone for the event start/end. | writable |
| `eventType` | `string` | Specific type of the event. This cannot be modified after the event is created. Possible values are:  * "`birthday`" - A special all-day event with an annual recurrence. * "`default`" - A regular event or not further specified. * "`focusTime`" - A focus-time event. * "`fromGmail`" - An event from Gmail. This type of event cannot be created. * "`outOfOffice`" - An out-of-office event. * "`workingLocation`" - A working location event. | writable |
| `extendedProperties.private` | `object` | Properties that are private to the copy of the event that appears on this calendar. | writable |
| `extendedProperties.shared` | `object` | Properties that are shared between copies of the event on other attendees' calendars. | writable |
| `focusTimeProperties` | `nested object` | Focus Time event data. Used if `eventType` is `focusTime`. | writable |
| `gadget.display` | `string` | The gadget's display mode. Deprecated. Possible values are:  * "`icon`" - The gadget displays next to the event's title in the calendar view. * "`chip`" - The gadget displays when the event is clicked. | writable |
| `gadget.height` | `integer` | The gadget's height in pixels. The height must be an integer greater than 0. Optional. Deprecated. | writable |
| `gadget.iconLink` | `string` | The gadget's icon URL. The URL scheme must be HTTPS. Deprecated. | writable |
| `gadget.link` | `string` | The gadget's URL. The URL scheme must be HTTPS. Deprecated. | writable |
| `gadget.preferences` | `object` | Preferences. | writable |
| `gadget.title` | `string` | The gadget's title. Deprecated. | writable |
| `gadget.type` | `string` | The gadget's type. Deprecated. | writable |
| `gadget.width` | `integer` | The gadget's width in pixels. The width must be an integer greater than 0. Optional. Deprecated. | writable |
| `guestsCanInviteOthers` | `boolean` | Whether attendees other than the organizer can invite others to the event. Optional. The default is True. | writable |
| `guestsCanModify` | `boolean` | Whether attendees other than the organizer can modify the event. Optional. The default is False. | writable |
| `guestsCanSeeOtherGuests` | `boolean` | Whether attendees other than the organizer can see who the event's attendees are. Optional. The default is True. | writable |
| `id` | `string` | Opaque identifier of the event. When creating new single or recurring events, you can specify their IDs. Provided IDs must follow these rules:  * characters allowed in the ID are those used in base32hex encoding, i.e. lowercase letters a-v and digits 0-9, see section 3.1.2 in [RFC2938](http://tools.ietf.org/html/rfc2938#section-3.1.2) * the length of the ID must be between 5 and 1024 characters * the ID must be unique per calendar  Due to the globally distributed nature of the system, we cannot guarantee that ID collisions will be detected at event creation time. To minimize the risk of collisions we recommend using an established UUID algorithm such as one described in [RFC4122](https://tools.ietf.org/html/rfc4122). If you do not specify an ID, it will be automatically generated by the server.  Note that the `icalUID` and the `id` are not identical and only one of them should be supplied at event creation time. One difference in their semantics is that in recurring events, all occurrences of one event have different `id`s while they all share the same `icalUID`s. | writable |
| `location` | `string` | Geographic location of the event as free-form text. Optional. | writable |
| `originalStartTime.date` | `date` | The date, in the format "yyyy-mm-dd", if this is an all-day event. | writable |
| `originalStartTime.dateTime` | `datetime` | The time, as a combined date-time value (formatted according to [RFC3339](https://tools.ietf.org/html/rfc3339)). A time zone offset is required unless a time zone is explicitly specified in `timeZone`. | writable |
| `originalStartTime.timeZone` | `string` | The time zone in which the time is specified. (Formatted as an IANA Time Zone Database name, e.g. "Europe/Zurich".) For recurring events this field is required and specifies the time zone in which the recurrence is expanded. For single events this field is optional and indicates a custom time zone for the event start/end. | writable |
| `outOfOfficeProperties` | `nested object` | Out of office event data. Used if `eventType` is `outOfOffice`. | writable |
| `recurrence[]` | `list` | List of RRULE, EXRULE, RDATE and EXDATE lines for a recurring event, as specified in [RFC5545](http://tools.ietf.org/html/rfc5545#section-3.8.5). Note that DTSTART and DTEND lines are not allowed in this field; event start and end times are specified in the `start` and `end` fields. This field is omitted for single events or instances of recurring events. | writable |
| `reminders.overrides[]` | `list` | If the event doesn't use the default reminders, this lists the reminders specific to the event, or, if not set, indicates that no reminders are set for this event. The maximum number of override reminders is 5. | writable |
| `reminders.overrides[].method` | `string` | The method used by this reminder. Possible values are:  * "`email`" - Reminders are sent via email. * "`popup`" - Reminders are sent via a UI popup.   Required when adding a reminder. | writable |
| `reminders.overrides[].minutes` | `integer` | Number of minutes before the start of the event when the reminder should trigger. Valid values are between 0 and 40320 (4 weeks in minutes). Required when adding a reminder. | writable |
| `reminders.useDefault` | `boolean` | Whether the default reminders of the calendar apply to the event. | writable |
| `sequence` | `integer` | Sequence number as per iCalendar. | writable |
| `source.title` | `string` | Title of the source; for example a title of a web page or an email subject. | writable |
| `source.url` | `string` | URL of the source pointing to a resource. The URL scheme must be HTTP or HTTPS. | writable |
| `start.date` | `date` | The date, in the format "yyyy-mm-dd", if this is an all-day event. | writable |
| `start.dateTime` | `datetime` | The time, as a combined date-time value (formatted according to [RFC3339](https://tools.ietf.org/html/rfc3339)). A time zone offset is required unless a time zone is explicitly specified in `timeZone`. | writable |
| `start.timeZone` | `string` | The time zone in which the time is specified. (Formatted as an IANA Time Zone Database name, e.g. "Europe/Zurich".) For recurring events this field is required and specifies the time zone in which the recurrence is expanded. For single events this field is optional and indicates a custom time zone for the event start/end. | writable |
| `status` | `string` | Status of the event. Optional. Possible values are:  * "`confirmed`" - The event is confirmed. This is the default status. * "`tentative`" - The event is tentatively confirmed. * "`cancelled`" - The event is cancelled (deleted). The [list](/calendar/v3/reference/events/list) method returns cancelled events only on incremental sync (when `syncToken` or `updatedMin` are specified) or if the `showDeleted` flag is set to `true`. The [get](/calendar/v3/reference/events/get) method always returns them. A cancelled status represents two different states depending on the event type:    1. Cancelled exceptions of an uncancelled recurring event indicate that this instance should no longer be presented to the user. Clients should store these events for the lifetime of the parent recurring event. Cancelled exceptions are only guaranteed to have values for the `id`, `recurringEventId` and `originalStartTime` fields populated. The other fields might be empty.   2. All other cancelled events represent deleted events. Clients should remove their locally synced copies. Such cancelled events will eventually disappear, so do not rely on them being available indefinitely. Deleted events are only guaranteed to have the `id` field populated.On the organizer's calendar, cancelled events continue to expose event details (summary, location, etc.) so that they can be restored (undeleted). Similarly, the events to which the user was invited and that they manually removed continue to provide details. However, incremental sync requests with `showDeleted` set to false will not return these details. If an event changes its organizer (for example via the [move](/calendar/v3/reference/events/move) operation) and the original organizer is not on the attendee list, it will leave behind a cancelled event where only the `id` field is guaranteed to be populated. | writable |
| `summary` | `string` | Title of the event. | writable |
| `transparency` | `string` | Whether the event blocks time on the calendar. Optional. Possible values are:  * "`opaque`" - Default value. The event does block time on the calendar. This is equivalent to setting **Show me as** to **Busy** in the Calendar UI. * "`transparent`" - The event does not block time on the calendar. This is equivalent to setting **Show me as** to **Available** in the Calendar UI. | writable |
| `visibility` | `string` | Visibility of the event. Optional. Possible values are:  * "`default`" - Uses the default visibility for events on the calendar. This is the default value. * "`public`" - The event is public and event details are visible to all readers of the calendar. * "`private`" - The event is private and only event attendees may view event details. * "`confidential`" - The event is private. This value is provided for compatibility reasons. | writable |
| `workingLocationProperties` | `nested object` | Working location event data. | writable |
| `workingLocationProperties.customLocation` | `object` | If present, specifies that the user is working from a custom location. | writable |
| `workingLocationProperties.customLocation.label` | `string` | An optional extra label for additional information. | writable |
| `workingLocationProperties.homeOffice` | `any value` | If present, specifies that the user is working at home. | writable |
| `workingLocationProperties.officeLocation` | `object` | If present, specifies that the user is working from an office. | writable |
| `workingLocationProperties.officeLocation.buildingId` | `string` | An optional building identifier. This should reference a building ID in the organization's Resources database. | writable |
| `workingLocationProperties.officeLocation.deskId` | `string` | An optional desk identifier. | writable |
| `workingLocationProperties.officeLocation.floorId` | `string` | An optional floor identifier. | writable |
| `workingLocationProperties.officeLocation.floorSectionId` | `string` | An optional floor section identifier. | writable |
| `workingLocationProperties.officeLocation.label` | `string` | The office name that's displayed in Calendar Web and Mobile clients. We recommend you reference a building name in the organization's Resources database. | writable |
| `workingLocationProperties.type` | `string` | Type of the working location. Possible values are:  * "`homeOffice`" - The user is working at home. * "`officeLocation`" - The user is working from an office. * "`customLocation`" - The user is working from a custom location.  Any details are specified in a sub-field of the specified name, but this field may be missing if empty. Any other fields are ignored. Required when adding working location properties. | writable |

## Response

If successful, this method returns an [Events resource](/workspace/calendar/api/v3/reference/events#resource) in the response body.




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/concepts

Send feedback

# Concepts overview Stay organized with collections Save and categorize content based on your preferences.

Each Calendar user is associated with a primary calendar and a
number of other calendars that they can also access. Users can create events and
invite other users, as shown in the following diagram:

This example shows two users, Susan A and Wei X. Each has a primary calendar and
several other associated calendars. The example also shows two events: an
end-of-year presentation and a team offsite.

Here are some facts shown in the diagram:

* Susan's calendar list includes her primary calendar as well as calendars for
  her team and cello lessons.
* Wei's calendar list includes his primary calendar as well as the team
  calendar, a status tracking calendar, and Susan's primary calendar.
* The end-of-year presentation event shows Susan as the organizer and Wei as an
  attendee.
* The team off-site in Hawaii event has the team calendar as an organizer
  (meaning it was created in that calendar) and copied to Susan and Wei as
  attendees.

These concepts: calendars, events, attendees, and others are all explained
further in the other sections of this guide:

* [Calendars and Events](/workspace/calendar/api/concepts/events-calendars)
* [Calendar sharing](/workspace/calendar/api/concepts/sharing)
* [Invite users to an event](/workspace/calendar/api/concepts/inviting-attendees-to-events)
* [Reminders and Notification](/workspace/calendar/api/concepts/reminders)
* [Google Workspace Features](/workspace/calendar/api/concepts/domain)




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/api

Send feedback

# Google Calendar API overview Stay organized with collections Save and categorize content based on your preferences.

The Google Calendar API is a RESTful API that can be accessed through explicit HTTP
calls or using the Google Client Libraries. The API exposes most of the features
available in the Google Calendar Web interface.

Following is a list of common terms used in the Google Calendar API:

*[Event](/workspace/calendar/v3/reference/events)*
:   An event on a calendar containing information such as the title, start and end
    times, and attendees. Events can be either single events or [recurring
    events](/workspace/calendar/concepts/events-calendars#recurring_events). An event is
    represented by an
    [Event resource](/workspace/calendar/v3/reference/events#resource-representations).

*[Calendar](/workspace/calendar/v3/reference/calendars)*
:   A collection of events. Each calendar has associated metadata, such as
    calendar description or default calendar time zone. The metadata for a single
    calendar is represented by a
    [Calendar resource](/workspace/calendar/v3/reference/calendars).

*[Calendar List](/workspace/calendar/v3/reference/calendarList)*
:   A list of all calendars on a user's calendar list in the Calendar UI. The
    metadata for a single calendar that appears on the calendar list is represented
    by a
    [CalendarListEntry resource](/workspace/calendar/v3/reference/calendarList).
    This metadata includes user-specific properties of the calendar, such
    as its color or notifications for new events.

*[Setting](/workspace/calendar/v3/reference/settings)*
:   A user preference from the Calendar UI, such as the user's
    time zone. A single user preference is represented by a
    [Setting Resource](/workspace/calendar/v3/reference/settings).

*[ACL](/workspace/calendar/v3/reference/acl)*
:   An access control rule granting a user (or a group of users) a specified level
    of access to a calendar. A single access control rule is represented by an [ACL
    resource](/workspace/calendar/v3/reference/acl).

## Related topics

* To learn about developing with Google Workspace APIs, including handling
  authentication and authorization, refer
  to
  [Get started as a Google Workspace developer](/workspace/guides/getstarted-overview).
* To learn how to configure and run a simple Google Calendar API app, read the
  [Quickstarts overview](/workspace/calendar/quickstarts-overview).

|  |  |
| --- | --- |
|  | Want to see the Google Calendar API in action?  The Google Workspace Developers channel offers videos about tips, tricks, and the latest features.  [Subscribe now](https://www.youtube.com/channel/UCUcg6az6etU_gRtZVAhBXaw) |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/api/concepts/domain

Send feedback

# Domain resources, rooms & calendars Stay organized with collections Save and categorize content based on your preferences.

Calendar API offers several concepts that are primarily useful for
[Google Workspace](https://workspace.google.com/)
customers. These customers often have
resources—rooms, projectors, and so forth—that they may wish to
book for specific events. Furthermore, it’s common to build internal apps that
need access to all user calendars in a domain, for example to add corporate
events to them.

## Domain resources & rooms

You can book resources and rooms by adding them to events as attendees, using
their email address. When they receive the invitation, they automatically
accept or decline the event based on the availability and access right of the
inviting user.

**Note:** The Calendar API does not offer a way to create resource calendars.
To do this, you need to use the Directory API's
[Calendar Resource](/workspace/admin/directory/reference/rest/v1/resources.calendars)
object.
The calendarId corresponds to the resourceEmail field of the Calendar Resource
representation.

## Accessing domain calendars as an app

An app can access domain-owned calendars without requiring
user credentials if it authenticates using a [service
account](/identity/protocols/OAuth2ServiceAccount). The service account must
have the necessary access using [domain-wide authority
delegation](/identity/protocols/OAuth2ServiceAccount#delegatingauthority). In
order to impersonate a user account, specify the email address of the user
account with the `setServiceAccountUser` method of the `GoogleCredential`
factory.




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/api/guides/push

Send feedback

# Push notifications Stay organized with collections Save and categorize content based on your preferences.

This document describes how to use push notifications that inform your
application when a resource changes.

## Overview

The Google Calendar API provides push notifications that let you monitor
changes in resources. You can use this feature to improve the performance of
your application. It lets you eliminate the extra network and compute
costs involved with polling resources to determine if they have changed.
Whenever a watched resource changes, the Google Calendar API notifies your
application.

To use push notifications, you must do two things:

* Set up your receiving URL or "webhook" callback receiver.

  This
  is an HTTPS server that handles the API notification messages that are
  triggered when a resource changes.
* Set up a ([notification channel](https://cloud.google.com/monitoring/support/notification-options)) for each resource endpoint you want to
  watch.

  A channel specifies routing information for notification
  messages. As part of the channel setup, you must identify the specific URL where
  you want to receive notifications. Whenever a channel's resource changes,
  the Google Calendar API sends a notification message as a `POST`
  request to that URL.

Currently, the Google Calendar API supports notifications for changes to
the [Acl](/workspace/calendar/v3/reference/acl/watch), [CalendarList](/workspace/calendar/v3/reference/calendarList/watch), [Events](/workspace/calendar/v3/reference/events/watch), and [Settings](/workspace/calendar/v3/reference/settings/watch) resources.

## Create notification channels

To request push notifications, you must set up a notification channel
for each resource you want to monitor. After your notification channels are set
up, the Google Calendar API informs your application when any watched resource
changes.

### Make watch requests

Each watchable Google Calendar API resource has an associated
`watch` method at a URI of the following form:

```
https://www.googleapis.com/API_NAME/API_VERSION/RESOURCE_PATH/watch
```

To set up a notification channel for messages about changes to a
particular resource, send a `POST` request to the
`watch` method for the resource.

Each notification channel is associated both with a particular user and
a particular resource (or set of resources). A `watch` request
won't be successful unless the current user
owns or has permission to access this resource.

#### Example

Start watching for changes to a collection of events on a given calendar:

```
POST https://www.googleapis.com/calendar/v3/calendars/my_calendar@gmail.com/events/watch
Authorization: Bearer auth_token_for_current_user
Content-Type: application/json

{
  "id": "01234567-89ab-cdef-0123456789ab", // Your channel ID.
  "type": "web_hook",
  "address": "https://mydomain.com/notifications", // Your receiving URL.
  ...
  "token": "target=myApp-myCalendarChannelDest", // (Optional) Your channel token.
  "expiration": 1426325213000 // (Optional) Your requested channel expiration time.
}
```

#### Required properties

With each `watch` request, you must provide these fields:

* An `id` property string that uniquely identifies this
  new notification channel within your project. We recommend using
  a universally unique identifier
  ([UUID](http://en.wikipedia.org/wiki/UUID)) or any similar
  unique string. Maximum length: 64 characters.

  The ID value you set is echoed back in the
  `X-Goog-Channel-Id` HTTP header of every notification
  message that you receive for this channel.
* A `type` property string set to the value
  `web_hook`.
* An `address` property string set to the URL that listens
  and responds to notifications for this notification channel. This is
  your webhook callback URL, and it must use HTTPS.

  Note that the Google Calendar API is able to send notifications to
  this HTTPS address only if there's a valid SSL certificate installed
  on your web server. Invalid certificates include:

  + Self-signed certificates.
  + Certificates signed by an untrusted source.
  + Certificates that have been revoked.
  + Certificates that have a subject that doesn't match the target
    hostname.

#### Optional properties

You can also specify these optional fields with your
`watch` request:

* A `token` property that specifies an arbitrary string
  value to use as a channel token. You can use notification channel
  tokens for various purposes. For example, you can use the
  token to verify that each incoming message is for a channel that your
  application created—to ensure that the notification is not being
  spoofed—or to route the message to the right destination within
  your application based on the purpose of this channel. Maximum length:
  256 characters.

  The token is included in the
  `X-Goog-Channel-Token` HTTP header in every notification
  message that your application receives for this channel.

  If you use notification channel tokens, we recommend that you:

  + Use an extensible encoding format, such as URL query
    parameters. Example: `forwardTo=hr&createdBy=mobile`
  + Don't include sensitive data such as OAuth tokens.**Note:** If you must send highly-sensitive
  data, make sure it's encrypted before adding it to the
  token.
* An `expiration` property string set to a
  [Unix timestamp](http://en.wikipedia.org/wiki/Unix_time)
  (in milliseconds) of the date and time when you want the Google Calendar API to
  stop sending messages for this notification channel.

  If a channel has an expiration time, it's included as the value
  of the `X-Goog-Channel-Expiration` HTTP header (in human-readable
  format) in every notification message that your
  application receives for this channel.

For more details on the request, refer to the `watch` method
for the [Acl](/workspace/calendar/v3/reference/acl/watch), [CalendarList](/workspace/calendar/v3/reference/calendarList/watch), [Events](/workspace/calendar/v3/reference/events/watch), and [Settings](/workspace/calendar/v3/reference/settings/watch) resources in the API Reference.

#### Watch response

If the `watch` request successfully creates a notification
channel, it returns an HTTP `200 OK` status code.

The message body of the watch response provides information about the
notification channel you just created, as shown in the example below.

```
{
  "kind": "api#channel",
  "id": "01234567-89ab-cdef-0123456789ab"", // ID you specified for this channel.
  "resourceId": "o3hgv1538sdjfh", // ID of the watched resource.
  "resourceUri": "https://www.googleapis.com/calendar/v3/calendars/my_calendar@gmail.com/events", // Version-specific ID of the watched resource.
  "token": "target=myApp-myCalendarChannelDest", // Present only if one was provided.
  "expiration": 1426325213000, // Actual expiration time as Unix timestamp (in ms), if applicable.
}
```

In addition to the properties you sent as part of your request, the
returned information also includes the `resourceId` and
`resourceUri` to identify the resource being watched on this
notification channel.

**Note:** The `resourceId` property is a
stable, version-independent identifier for the resource. The
`resourceUri` property is the canonical URI of the watched
resource in the context of the current API version, so it's
version-specific.

You can pass the returned information to other notification channel
operations, such as when you want to [stop receiving
notifications](#stopping).

For more details on the response, refer to the `watch`
method for the [Acl](/workspace/calendar/v3/reference/acl/watch), [CalendarList](/workspace/calendar/v3/reference/calendarList/watch), [Events](/workspace/calendar/v3/reference/events/watch), and [Settings](/workspace/calendar/v3/reference/settings/watch) resources in the API Reference.

#### Sync message

After creating a notification channel to watch a resource, the
Google Calendar API sends a `sync` message to indicate that
notifications are starting. The `X-Goog-Resource-State` HTTP
header value for these messages is `sync`. Due to network
timing issues, it's possible to receive the `sync` message
even before you receive the `watch` method response.

It's safe to ignore the `sync` notification, but you can
also use it. For example, if you decide you don't want to keep
the channel, you can use the `X-Goog-Channel-ID` and
`X-Goog-Resource-ID` values in a call to
[stop receiving notifications](#stopping). You can also use the
`sync` notification to do some initialization to prepare for
later events.

The format of `sync` messages the Google Calendar API sends to
your receiving URL is shown below.

```
POST https://mydomain.com/notifications // Your receiving URL.
X-Goog-Channel-ID: channel-ID-value
X-Goog-Channel-Token: channel-token-value
X-Goog-Channel-Expiration: expiration-date-and-time // In human-readable format. Present only if the channel expires.
X-Goog-Resource-ID: identifier-for-the-watched-resource
X-Goog-Resource-URI: version-specific-URI-of-the-watched-resource
X-Goog-Resource-State: sync
X-Goog-Message-Number: 1
```

Sync messages always have an `X-Goog-Message-Number` HTTP
header value of `1`. Each subsequent notification for this channel has
a message number that's larger than the previous one, though the message
numbers will not be sequential.

### Renew notification channels

A notification channel can have an expiration time, with a value
determined either by your request or by any Google Calendar API internal limits
or defaults (the more restrictive value is used). The channel's expiration
time, if it has one, is included as a [Unix timestamp](http://en.wikipedia.org/wiki/Unix_time)
(in milliseconds) in the information returned by the `watch` method. In addition, the
expiration date and time is included (in human-readable format) in every
notification message your application receives for this channel in the
`X-Goog-Channel-Expiration` HTTP header.

Currently, there's no automatic way to renew a notification channel. When
a channel is close to its expiration, you must replace it with a new one by calling
the `watch` method. As always, you must use a unique value for
the `id` property of the new channel. Note that there's likely
to be an "overlap" period of time when the two notification channels for the
same resource are active.

## Receive notifications

Whenever a watched resource changes, your application receives a
notification message describing the change. The Google Calendar API sends these
messages as HTTPS `POST` requests to the URL you specified as the
[`address` property](#address_prop) for this notification
channel.

**Note:** Notification delivery HTTPS requests
specify a user agent of `APIs-Google` and respect robots.txt
directives, as described in [APIs Google
User Agent](/search/docs/crawling-indexing/apis-user-agent).

### Interpret the notification message format

All notification messages include a set of HTTP headers that have
`X-Goog-` prefixes.
Some types of notifications can also include a
message body.

#### Headers

Notification messages posted by the Google Calendar API to your receiving
URL include the following HTTP headers:

| Header | Description |
| --- | --- |
| **Always present** | |
| `X-Goog-Channel-ID` | UUID or other unique string you provided to identify this notification channel. |
| `X-Goog-Message-Number` | Integer that identifies this message for this notification channel. Value is always `1` for `sync` messages. Message numbers increase for each subsequent message on the channel, but they're not sequential. |
| `X-Goog-Resource-ID` | An opaque value identifying the watched resource. This ID is stable across API versions. |
| `X-Goog-Resource-State` | The new resource state that triggered the notification. Possible values: `sync`, `exists`, or `not_exists`. |
| `X-Goog-Resource-URI` | An API-version-specific identifier for the watched resource. |
| **Sometimes present** | |
| `X-Goog-Channel-Expiration` | Date and time of notification channel expiration, expressed in human-readable format. Only present if defined. |
| `X-Goog-Channel-Token` | Notification channel token that was set by your application, and that you can use to verify the notification source. Only present if defined. |

Notification messages posted by the Google Calendar API to your receiving URL do not include a message body. These messages do not contain specific information about updated resources, you will need to make another API call to see the full change details.

#### Examples

Change notification message for modified collection of events:

```
POST https://mydomain.com/notifications // Your receiving URL.
Content-Type: application/json; utf-8
Content-Length: 0
X-Goog-Channel-ID: 4ba78bf0-6a47-11e2-bcfd-0800200c9a66
X-Goog-Channel-Token: 398348u3tu83ut8uu38
X-Goog-Channel-Expiration: Tue, 19 Nov 2013 01:13:52 GMT
X-Goog-Resource-ID:  ret08u3rv24htgh289g
X-Goog-Resource-URI: https://www.googleapis.com/calendar/v3/calendars/my_calendar@gmail.com/events
X-Goog-Resource-State:  exists
X-Goog-Message-Number: 10
```

### Respond to notifications

To indicate success, you can return any of the following status codes:
`200`, `201`, `202`, `204`, or
`102`.

If your service uses [Google's API client library](/admin-sdk/directory/v1/libraries)
and returns `500`,`502`, `503`, or `504`, the Google Calendar API
retries with [exponential backoff](https://www.google.com/search?q=define%3Aexponential+backoff&oq=define%3Aexponential+backoff).
Every other return status code is considered to be a message failure.

### Understand Google Calendar API notification events

This section provides details on the notification messages you can
receive when using push notifications with the Google Calendar API.

| X-Goog-Resource-State | Applies to | Delivered when |
| --- | --- | --- |
| `sync` | ACLs, Calendar lists, Events, Settings. | A new channel was successfully created. You can expect to start receiving notifications for it. |
| `exists` | ACLs, Calendar lists, Events, Settings. | There was a change to a resource. Possible changes include the creation of a new resource, or the modification or deletion of an existing resource. |

## Stop notifications

The `expiration` property controls when the notifications stop automatically. You can
choose to stop receiving notifications for a particular channel before it
expires by calling the `stop` method at
the following URI:

```
https://www.googleapis.com/calendar/v3/channels/stop
```

This method requires that you provide at least the channel's
`id` and the `resourceId` properties, as shown in the
example below. Note that if the Google Calendar API has several types of
resources that have `watch` methods, there's only one
`stop` method.

Only users with the right permission can stop a channel. In particular:

* If the channel was created by a regular user account, only the same
  user from the same client (as identified by the OAuth 2.0 client IDs from the
  auth tokens) who created the channel can stop the channel.
* If the channel was created by a service account, any user from the same
  client can stop the channel.

The following code sample shows how to stop receiving notifications:

```
POST https://www.googleapis.com/calendar/v3/channels/stop
  
Authorization: Bearer CURRENT_USER_AUTH_TOKEN
Content-Type: application/json

{
  "id": "4ba78bf0-6a47-11e2-bcfd-0800200c9a66",
  "resourceId": "ret08u3rv24htgh289g"
}
```

#### Special considerations

When working with push notifications, keep the following in mind:

**Events and ACLs are per-calendar** If you want to get notified about all event or ACL changes for calendars A and B, you need to separately subscribe to the events/ACL collections for A and for B.

**Settings and calendar lists are per-user** Settings and calendar lists only have one collection per user, so you can subscribe just once.

Also, you won’t be notified when you gain access to a new collection (for example, a new calendar) although you *will* be notified if that calendar is added to the calendar list (assuming you are subscribed to the calendar list collection).

Notifications are not 100% reliable. Expect a small percentage of messages to get dropped under normal working conditions. Make sure to handle these
missing messages gracefully, so that the application still syncs even if no push messages are received.




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/auth

Send feedback

# Configure the OAuth consent screen and choose scopes Stay organized with collections Save and categorize content based on your preferences.

## Page Summary

outlined\_flag

* When using OAuth 2.0 for authorization with Google Workspace APIs, you need to configure an OAuth consent screen that defines the access your app requests and displays this information to users.
* You should carefully select authorization scopes to provide your app with the minimum necessary access to Google Workspace data, as users are more likely to grant consent to apps with limited and clearly defined scopes.
* All apps require an OAuth consent screen, but explicitly listing scopes is necessary only for apps used outside your organization, and certain scope categories necessitate additional reviews by Google.
* To configure your OAuth consent screen, you'll need to provide app details, select the user type (internal or external), define the necessary scopes, and potentially add test users if applicable.
* Sensitive and restricted scopes require additional verification and security assessments due to their access levels to user data, so consider using non-sensitive alternatives whenever possible.

When you use OAuth 2.0 for authorization, Google displays a consent screen to
the user including a summary of your project, its policies, and the requested
authorization scopes of access. Configuring your app's OAuth consent screen
defines what is displayed to users and app reviewers, and registers your app
so you can publish it later.

**Note:** Some Google Workspace APIs, such as the Drive API, have
documentation covering API-specific authentication and authorization
information. Ensure you read that documentation before continuing with this
page.

To define the level of access granted to your app, you need to identify and
declare *authorization scopes*. An authorization scope is an OAuth 2.0 URI string
that contains the Google Workspace app name, what kind of data it accesses, and
the level of access. Scopes are your app's requests to work with Google Workspace data, including
users' Google Account data.

When your app is installed, a user is asked to validate the scopes used
by the app. Generally, you should choose the most narrowly focused scope
possible and avoid requesting scopes that your app doesn't require. Users more
readily grant access to limited, clearly described scopes.

All apps using OAuth 2.0 require a consent screen configuration, but you only
need to list scopes for apps used by people outside your Google Workspace
organization.

**Tip:** If you don't know required consent screen information, you can use
placeholder information prior to release.

For security reasons, you can't remove the OAuth 2.0 consent screen
after you've configured it.

## Configure OAuth consent

1. In the Google Cloud console, go to Menu menu
   > **Google Auth platform**
   > **Branding**.

   [Go to Branding](https://console.cloud.google.com/auth/branding)
2. If you have already configured the Google Auth platform, you can configure the following OAuth Consent Screen settings in [Branding](https://console.cloud.google.com/auth/branding), [Audience](https://console.cloud.google.com/auth/audience), and [Data Access](https://console.cloud.google.com/auth/scopes).
   If you see a message that says **Google Auth platform not configured yet**, click **Get Started**:

1. Under **App Information**, in **App name**, enter an **App name**.
2. In **User support email**, choose a support email address where users can contact you if they have questions about their consent.
3. Click **Next**.
4. Under **Audience**, select the user type for your app.
5. Click **Next**.
6. Under **Contact Information**, enter an **Email address** where you can be notified about any changes to your project.
7. Click **Next**.
8. Under **Finish**, review the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy) and if you agree, select **I agree to the Google API Services: User Data Policy**.
9. Click **Continue**.
10. Click **Create**.
11. If you selected **External** for user type, add test users:
    1. Click **Audience**.
    2. Under **Test users**, click **Add users**.
    3. Enter your email address and any other authorized test users, then click **Save**.

3. If you're creating an app for use outside of your Google Workspace
   organization, click **Data Access** **>** **Add or Remove Scopes**. We recommend the following best practices when
   selecting scopes:

   * Select the scopes that provide the minimum level of access required by your app. For a list of
     available scopes, see
     [OAuth 2.0 Scopes for Google APIs](/identity/protocols/oauth2/scopes).
   * Review the scopes listed in each of the three sections: non-sensitive
     scopes, sensitive scopes, and restricted scopes. For any scopes listed in the
     "Your sensitive scopes" or "Your restricted scopes" sections, try to identify
     alternative non-sensitive scopes to avoid unnecessary additional reviews.
   * Some scopes require additional reviews by Google. For apps used only
     internally by your Google Workspace organization, scopes aren't listed on the
     consent screen and use of restricted or sensitive scopes doesn't require
     further review by Google. For more information, see
     [Scope categories](/workspace/guides/configure-oauth-consent#scope_categories).
4. After selecting the scopes required
   by your app, click **Save**.

For more information about configuring OAuth consent, see
[Get started with the Google Auth platform](https://support.google.com/cloud/answer/15544987).

## Scope categories

Some scopes require additional reviews and requirements
because of the level or type of access they grant. Consider the following types
of scopes:

|  |  |  | [Basic app verification](https://support.google.com/cloud/answer/9110914#ver-prep&zippy=%2Csteps-to-prepare-for-verification) required | [Additional app verification](https://support.google.com/cloud/answer/9110914#ver-prep&zippy=%2Csteps-to-submit-your-app) required | [Security assessment](https://support.google.com/cloud/answer/9110914#sec-assess&zippy=%2Csecurity-assessment) required |
| --- | --- | --- | --- | --- | --- |
|  | **Non-sensitive scopes** *(recommended)* | Grant access only to limited data that's immediately relevant to a specific action. | check | — | — |
|  | **Sensitive scopes** | Grant access to personal user data, resources, or actions. | check | check | — |
|  | **Restricted scopes** | Grant access to highly-sensitive or extensive user data or actions. | check | check | check |

## Next step

[Create access credentials](/workspace/guides/create-credentials) for your app.




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/caldav/v2/guide

Send feedback

# CalDAV API Developer's Guide Stay organized with collections Save and categorize content based on your preferences.

CalDAV is an extension of WebDAV that provides a standard for clients to access
calendar information on a remote server.

Google provides a CalDAV interface that you can use to view and manage calendars
using the CalDAV protocol.

## Specifications

For each of the relevant specifications, Google's CalDAV support is as follows:

* [rfc4918: HTTP Extensions for Web Distributed Authoring and Versioning
  (WebDAV)](http://tools.ietf.org/html/rfc4918)
  + Supports the HTTP methods `GET`, `PUT`, `HEAD`, `DELETE`, `POST`,
    `OPTIONS`, `PROPFIND` and `PROPPATCH`.
  + Does not support the HTTP methods `LOCK`, `UNLOCK`, `COPY`, `MOVE`, or
    `MKCOL`, or the `If*` header (except for `If-Match`).
  + Does not support arbitrary (user-defined) WebDAV properties.
  + Does not support WebDAV Access Control (rfc3744).
* [rfc4791: Calendaring Extensions to WebDAV (CalDAV)](http://tools.ietf.org/html/rfc4791)
  + Supports the HTTP method `REPORT`. All reports except free-busy-query
    are implemented.
  + Does not support the HTTP method `MKCALENDAR`.
  + Does not support the `AUDIO` action.
* [rfc5545: iCalendar](http://tools.ietf.org/html/rfc5545)
  + Data exposed in the CalDAV interface is formatted according to the
    iCalendar specification.
  + Does not currently support `VTODO` or `VJOURNAL` data.
  + Does not support the Apple iCal® extension to allow user-settable URL properties.
* [rfc6578: Collection Synchronization for WebDAV](http://tools.ietf.org/html/rfc6578)
  + Client applications must switch to this mode of operation after the
    initial sync.
* [rfc6638: Scheduling Extensions to CalDAV](http://tools.ietf.org/html/rfc6638)
  + Supports a trivial "inbox," which is always empty.
  + Invitations you receive are automatically delivered into your "events"
    collection rather than being placed into your "inbox."
  + Does not support free-busy lookup.
* [caldav-ctag-02: Calendar Collection Entity Tag (CTag) in CalDAV](https://trac.calendarserver.org/browser/CalendarServer/trunk/doc/Extensions/caldav-ctag.txt)
  + The calendar `ctag` is like a resource `etag`; it changes when anything
    in the calendar has changed. This allows the client application to
    quickly determine that it does not need to synchronize any changed
    events.
* [calendar-proxy: Calendar User Proxy Functionality in CalDAV](https://github.com/apple/ccs-calendarserver/blob/master/doc/Extensions/caldav-proxy.txt)
  + To improve the performance of calendar synching from iOS devices, which
    don't support delegation, using the `calendar-proxy-read-for` or
    `calendar-proxy-write-for` properties with an iOS UserAgent will fail.

We have not yet provided a full implementation of all of the relevant
specifications. However, for many clients such as Apple's Calendar app
the CalDAV protocol should interoperate correctly.

Note: For account security and to prevent abuse, Google
might set cookies on client applications that access data via CalDAV.

## Creating your client ID

To use the CalDAV API you need to have
a [Google Account](https://www.google.com/accounts/NewAccount).
If you already have an account you can use, then you're all set.

Before you can send requests to the CalDAV API, you must register
your client with the [Google API Console](https://console.cloud.google.com/) by creating a project.

Go to the [Google API Console](https://console.cloud.google.com/project). Click **Create project**,
enter a name, and click **Create**.

The next step is to activate **CalDAV API**.

To enable an API for your project, do the following:

1. [Open the API Library](https://console.cloud.google.com/apis/library) in the Google API Console. If prompted, select a
   project or create a new one. The API Library lists all available
   APIs, grouped by product family and popularity.
2. If the API you want to enable isn't visible in the list, use search to
   find it.
3. Select the API you want to enable, then click the **Enable**
   button.
4. If prompted, enable billing.
5. If prompted, accept the API's Terms of Service.

To perform **CalDAV API** requests you will need
**Client ID** and **Client Secret**.

To find your project's client ID and client secret, do the following:

1. Select an existing OAuth 2.0 credential or open the [Credentials page](https://console.cloud.google.com/apis/credentials).
2. If you haven't done so already, create your project's OAuth 2.0
   credentials by clicking **Create credentials > OAuth client ID**, and
   providing the information needed to create the credentials.
3. Look for the **Client ID** in the **OAuth 2.0 client IDs** section.
   For details, click the client ID.

## Connecting to Google's CalDAV server

To use the CalDAV interface, a client program initially connects with the
calendar server at one of two starting points. In either case, the connection
must be made over HTTPS and must use the [OAuth 2.0](/workspace/calendar/auth)
authentication scheme. The CalDAV server will refuse to authenticate a request
unless it arrives over HTTPS with OAuth 2.0 authentication of a Google account.
Attempting to connect over HTTP or using Basic Authentication results in an HTTP
`401 Unauthorized` status code.

If the client program (such as Apple's Calendar app) requires a
principal collection as the starting point, the URI to connect to is:

```
https://apidata.googleusercontent.com/caldav/v2/calid/user
```

Where `calid` should be replaced by the
"calendar ID" of the calendar to be accessed. This can be found through the
Google Calendar web interface as follows: in the pull-down menu next to the
calendar name, select **Calendar Settings**. On the resulting page
the calendar ID is shown in a section labeled **Calendar
Address**. The calendar ID for a user's primary calendar is the same as
that user's email address.

If a client program (such as
[Mozilla Sunbird](http://www.mozilla.org/projects/calendar/sunbird/)) requires a
calendar collection as the starting point, the URI to connect to is:

```
https://apidata.googleusercontent.com/caldav/v2/calid/events
```

The old endpoint **https://www.google.com/calendar/dav** is
deprecated and no longer supported; use it at your own risk.
We recommend you transition to the new endpoint format described above.

iCal® is a trademark of Apple Inc.




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/v3/reference/settings/watch

Send feedback

# Settings: watch Stay organized with collections Save and categorize content based on your preferences.

**Note:**
Requires [authorization](#auth).

Watch for changes to Settings resources.

## Request

### HTTP request

```
POST https://www.googleapis.com/calendar/v3/users/me/settings/watch
```

### Parameters

| Parameter name | Value | Description |
| --- | --- | --- |

### Authorization

This request requires authorization with at least one of the following scopes:

| Scope |
| --- |
| `https://www.googleapis.com/auth/calendar.readonly` |
| `https://www.googleapis.com/auth/calendar` |
| `https://www.googleapis.com/auth/calendar.settings.readonly` |

For more information, see the [authentication and authorization](/workspace/guides/configure-oauth-consent) page.

### Request body

In the request body, supply data with the following structure:

```
{
  "id": string,
  "token": string,
  "type": string,
  "address": string,
  "params": {
    "ttl": string
  }
}
```

| Property name | Value | Description | Notes |
| --- | --- | --- | --- |
| `id` | `string` | A UUID or similar unique string that identifies this channel. |  |
| `token` | `string` | An arbitrary string delivered to the target address with each notification delivered over this channel. Optional. |  |
| `type` | `string` | The type of delivery mechanism used for this channel. Valid values are "`web_hook`" (or "`webhook`"). Both values refer to a channel where Http requests are used to deliver messages. |  |
| `address` | `string` | The address where notifications are delivered for this channel. |  |
| `params` | `object` | Additional parameters controlling delivery channel behavior. Optional. |  |
| `params.ttl` | `string` | The time-to-live in seconds for the notification channel. Default is 604800 seconds. |  |

## Response

If successful, this method returns a response body with the following structure:

```
{
  "kind": "api#channel",
  "id": string,
  "resourceId": string,
  "resourceUri": string,
  "token": string,
  "expiration": long
}
```

| Property name | Value | Description | Notes |
| --- | --- | --- | --- |
| `kind` | `string` | Identifies this as a notification channel used to watch for changes to a resource, which is "`api#channel`". |  |
| `id` | `string` | A UUID or similar unique string that identifies this channel. |  |
| `resourceId` | `string` | An opaque ID that identifies the resource being watched on this channel. Stable across different API versions. |  |
| `resourceUri` | `string` | A version-specific identifier for the watched resource. |  |
| `token` | `string` | An arbitrary string delivered to the target address with each notification delivered over this channel. Optional. |  |
| `expiration` | `long` | Date and time of notification channel expiration, expressed as a Unix timestamp, in milliseconds. Optional. |  |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/v3/reference/events/watch

Send feedback

# Events: watch Stay organized with collections Save and categorize content based on your preferences.

**Note:**
[Authorization](#auth) optional.

Watch for changes to Events resources.

## Request

### HTTP request

```
POST https://www.googleapis.com/calendar/v3/calendars/calendarId/events/watch
```

### Parameters

| Parameter name | Value | Description |
| --- | --- | --- |
| **Path parameters** | | |
| `calendarId` | `string` | Calendar identifier. To retrieve calendar IDs call the [calendarList.list](/workspace/calendar/api/v3/reference/calendarList/list) method. If you want to access the primary calendar of the currently logged in user, use the "`primary`" keyword. |
| **Optional query parameters** | | |
| `eventTypes` | `string` | Event types of resources to watch. Optional. This parameter can be repeated multiple times to watch resources of different types. If unset, returns all event types.   Acceptable values are:  * "`birthday`": Special all-day events with an annual recurrence. * "`default`": Regular events. * "`focusTime`": Focus time events. * "`fromGmail`": Events from Gmail. * "`outOfOffice`": Out of office events. * "`workingLocation`": Working location events. |

### Authorization

This request allows authorization with at least one of the following scopes:

| Scope |
| --- |
| `https://www.googleapis.com/auth/calendar.readonly` |
| `https://www.googleapis.com/auth/calendar` |
| `https://www.googleapis.com/auth/calendar.events.readonly` |
| `https://www.googleapis.com/auth/calendar.events` |
| `https://www.googleapis.com/auth/calendar.app.created` |
| `https://www.googleapis.com/auth/calendar.events.freebusy` |
| `https://www.googleapis.com/auth/calendar.events.owned` |
| `https://www.googleapis.com/auth/calendar.events.owned.readonly` |
| `https://www.googleapis.com/auth/calendar.events.public.readonly` |

For more information, see the [authentication and authorization](/workspace/guides/configure-oauth-consent) page.

### Request body

In the request body, supply data with the following structure:

```
{
  "id": string,
  "token": string,
  "type": string,
  "address": string,
  "params": {
    "ttl": string
  }
}
```

| Property name | Value | Description | Notes |
| --- | --- | --- | --- |
| `id` | `string` | A UUID or similar unique string that identifies this channel. |  |
| `token` | `string` | An arbitrary string delivered to the target address with each notification delivered over this channel. Optional. |  |
| `type` | `string` | The type of delivery mechanism used for this channel. Valid values are "`web_hook`" (or "`webhook`"). Both values refer to a channel where Http requests are used to deliver messages. |  |
| `address` | `string` | The address where notifications are delivered for this channel. |  |
| `params` | `object` | Additional parameters controlling delivery channel behavior. Optional. |  |
| `params.ttl` | `string` | The time-to-live in seconds for the notification channel. Default is 604800 seconds. |  |

## Response

If successful, this method returns a response body with the following structure:

```
{
  "kind": "api#channel",
  "id": string,
  "resourceId": string,
  "resourceUri": string,
  "token": string,
  "expiration": long
}
```

| Property name | Value | Description | Notes |
| --- | --- | --- | --- |
| `kind` | `string` | Identifies this as a notification channel used to watch for changes to a resource, which is "`api#channel`". |  |
| `id` | `string` | A UUID or similar unique string that identifies this channel. |  |
| `resourceId` | `string` | An opaque ID that identifies the resource being watched on this channel. Stable across different API versions. |  |
| `resourceUri` | `string` | A version-specific identifier for the watched resource. |  |
| `token` | `string` | An arbitrary string delivered to the target address with each notification delivered over this channel. Optional. |  |
| `expiration` | `long` | Date and time of notification channel expiration, expressed as a Unix timestamp, in milliseconds. Optional. |  |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/calendar/v3/reference/acl/watch

Send feedback

# Acl: watch Stay organized with collections Save and categorize content based on your preferences.

**Note:**
Requires [authorization](#auth).

Watch for changes to ACL resources.

## Request

### HTTP request

```
POST https://www.googleapis.com/calendar/v3/calendars/calendarId/acl/watch
```

### Parameters

| Parameter name | Value | Description |
| --- | --- | --- |
| **Path parameters** | | |
| `calendarId` | `string` | Calendar identifier. To retrieve calendar IDs call the [calendarList.list](/workspace/calendar/api/v3/reference/calendarList/list) method. If you want to access the primary calendar of the currently logged in user, use the "`primary`" keyword. |

### Authorization

This request requires authorization with at least one of the following scopes:

| Scope |
| --- |
| `https://www.googleapis.com/auth/calendar` |
| `https://www.googleapis.com/auth/calendar.acls` |
| `https://www.googleapis.com/auth/calendar.acls.readonly` |

For more information, see the [authentication and authorization](/workspace/guides/configure-oauth-consent) page.

### Request body

In the request body, supply data with the following structure:

```
{
  "id": string,
  "token": string,
  "type": string,
  "address": string,
  "params": {
    "ttl": string
  }
}
```

| Property name | Value | Description | Notes |
| --- | --- | --- | --- |
| `id` | `string` | A UUID or similar unique string that identifies this channel. |  |
| `token` | `string` | An arbitrary string delivered to the target address with each notification delivered over this channel. Optional. |  |
| `type` | `string` | The type of delivery mechanism used for this channel. Valid values are "`web_hook`" (or "`webhook`"). Both values refer to a channel where Http requests are used to deliver messages. |  |
| `address` | `string` | The address where notifications are delivered for this channel. |  |
| `params` | `object` | Additional parameters controlling delivery channel behavior. Optional. |  |
| `params.ttl` | `string` | The time-to-live in seconds for the notification channel. Default is 604800 seconds. |  |

## Response

If successful, this method returns a response body with the following structure:

```
{
  "kind": "api#channel",
  "id": string,
  "resourceId": string,
  "resourceUri": string,
  "token": string,
  "expiration": long
}
```

| Property name | Value | Description | Notes |
| --- | --- | --- | --- |
| `kind` | `string` | Identifies this as a notification channel used to watch for changes to a resource, which is "`api#channel`". |  |
| `id` | `string` | A UUID or similar unique string that identifies this channel. |  |
| `resourceId` | `string` | An opaque ID that identifies the resource being watched on this channel. Stable across different API versions. |  |
| `resourceUri` | `string` | A version-specific identifier for the watched resource. |  |
| `token` | `string` | An arbitrary string delivered to the target address with each notification delivered over this channel. Optional. |  |
| `expiration` | `long` | Date and time of notification channel expiration, expressed as a Unix timestamp, in milliseconds. Optional. |  |




Was this helpful?



Send feedback