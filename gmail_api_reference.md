# Gmail API Reference

Pages: 300


---
# https://developers.google.com/workspace/gmail/api/guides

Send feedback

# Gmail API Overview Stay organized with collections Save and categorize content based on your preferences.

The Gmail API is a RESTful API that can be used to access Gmail mailboxes and
send mail. For most web applications the Gmail API is the best choice for
authorized access to a user's Gmail data and is suitable for various
applications, such as:

* Read-only mail extraction, indexing, and backup
* Automated or programmatic message sending
* Email account migration
* Email organization including filtering and sorting of messages
* Standardization of email signatures across an organization

Following is a list of common terms used in the Gmail API:

*Message*
:   An email message containing the sender, recipients, subject, and body. After a
    message has been created, a message cannot be changed. A message is represented
    by a [message resource](/workspace/gmail/api/reference/rest/v1/users.messages#Message).

*Thread*
:   A collection of related messages forming a conversation. In an email client
    app, a thread is formed when one or more recipients respond to a message with
    their own message.

*Label*
:   A mechanism for organizing messages and threads. For example,
    the label "taxes" might be created and applied to all messages and threads
    having to do with a user's taxes. There are two types of labels:

    *System labels*
    :   Internally-created labels, such as `INBOX`, `TRASH`, or `SPAM`. These labels
        cannot be deleted or modified. However, some system labels, such as `INBOX`
        can be applied to, or removed from, messages and threads.

    *User labels*
    :   Labels created by a user. These labels can be deleted or modified by the
        user or an application. A user label is represented by a
        [label resource](/workspace/gmail/api/reference/rest/v1/users.labels).

*Draft*
:   An unsent message. A message contained within the draft can be replaced.
    Sending a draft automatically deletes the draft and creates a message with
    the `SENT` system label. A draft is represented by a
    [draft resource](/workspace/gmail/api/reference/rest/v1/users.drafts).

## Next steps

* To learn about developing with Google Workspace APIs, including handling
  authentication and authorization, refer
  to [Get started as a Google Workspace developer](/workspace/guides/getstarted-overview).
* To learn how to configure and run a simple Gmail API app, read the
  [Quickstarts overview](/workspace/gmail/api/guides/quickstarts-overview).




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages

Send feedback

# REST Resource: users.messages Stay organized with collections Save and categorize content based on your preferences.

* [Resource: Message](#Message)
  + [JSON representation](#Message.SCHEMA_REPRESENTATION)
  + [MessagePart](#Message.MessagePart)
    - [JSON representation](#Message.MessagePart.SCHEMA_REPRESENTATION)
  + [Header](#Message.Header)
    - [JSON representation](#Message.Header.SCHEMA_REPRESENTATION)
  + [ClassificationLabelValue](#Message.ClassificationLabelValue)
    - [JSON representation](#Message.ClassificationLabelValue.SCHEMA_REPRESENTATION)
  + [ClassificationLabelFieldValue](#Message.ClassificationLabelFieldValue)
    - [JSON representation](#Message.ClassificationLabelFieldValue.SCHEMA_REPRESENTATION)
* [Methods](#METHODS_SUMMARY)

## Resource: Message

An email message.

| JSON representation |
| --- |
| ``` {   "id": string,   "threadId": string,   "labelIds": [     string   ],   "snippet": string,   "historyId": string,   "internalDate": string,   "payload": {     object (MessagePart)   },   "sizeEstimate": integer,   "raw": string,   "classificationLabelValues": [     {       object (ClassificationLabelValue)     }   ] } ``` |

| Fields | |
| --- | --- |
| `id` | `string`  The immutable ID of the message. |
| `threadId` | `string`  The ID of the thread the message belongs to. To add a message or draft to a thread, the following criteria must be met:   1. The requested `threadId` must be specified on the `Message` or `Draft.Message` you supply with your request. 2. The `References` and `In-Reply-To` headers must be set in compliance with the [RFC 2822](https://tools.ietf.org/html/rfc2822) standard. 3. The `Subject` headers must match. |
| `labelIds[]` | `string`  List of IDs of labels applied to this message. |
| `snippet` | `string`  A short part of the message text. |
| `historyId` | `string`  The ID of the last history record that modified this message. |
| `internalDate` | `string (int64 format)`  The internal message creation timestamp (epoch ms), which determines ordering in the inbox. For normal SMTP-received email, this represents the time the message was originally accepted by Google, which is more reliable than the `Date` header. However, for API-migrated mail, it can be configured by client to be based on the `Date` header. |
| `payload` | `object (MessagePart)`  The parsed email structure in the message parts. |
| `sizeEstimate` | `integer`  Estimated size in bytes of the message. |
| `raw` | `string (bytes format)`  The entire email message in an RFC 2822 formatted and base64url encoded string. Returned in `messages.get` and `drafts.get` responses when the `format=RAW` parameter is supplied.  A base64-encoded string. |
| `classificationLabelValues[]` | `object (ClassificationLabelValue)`  Classification Label values on the message. Available Classification Label schemas can be queried using the Google Drive Labels API. Each classification label ID must be unique. If duplicate IDs are provided, only one will be retained, and the selection is arbitrary. Only used for Google Workspace accounts. |

### MessagePart

A single MIME message part.

| JSON representation |
| --- |
| ``` {   "partId": string,   "mimeType": string,   "filename": string,   "headers": [     {       object (Header)     }   ],   "body": {     object (MessagePartBody)   },   "parts": [     {       object (MessagePart)     }   ] } ``` |

| Fields | |
| --- | --- |
| `partId` | `string`  The immutable ID of the message part. |
| `mimeType` | `string`  The MIME type of the message part. |
| `filename` | `string`  The filename of the attachment. Only present if this message part represents an attachment. |
| `headers[]` | `object (Header)`  List of headers on this message part. For the top-level message part, representing the entire message payload, it will contain the standard RFC 2822 email headers such as `To`, `From`, and `Subject`. |
| `body` | `object (MessagePartBody)`  The message part body for this part, which may be empty for container MIME message parts. |
| `parts[]` | `object (MessagePart)`  The child MIME message parts of this part. This only applies to container MIME message parts, for example `multipart/*`. For non- container MIME message part types, such as `text/plain`, this field is empty. For more information, see [RFC 1521](http://www.ietf.org/rfc/rfc1521.txt). |

### Header

| JSON representation |
| --- |
| ``` {   "name": string,   "value": string } ``` |

| Fields | |
| --- | --- |
| `name` | `string`  The name of the header before the `:` separator. For example, `To`. |
| `value` | `string`  The value of the header after the `:` separator. For example, `someuser@example.com`. |

### ClassificationLabelValue

Classification Labels applied to the email message. Classification Labels are different from Gmail inbox labels. Only used for Google Workspace accounts. [Learn more about classification labels](https://support.google.com/a/answer/9292382).

| JSON representation |
| --- |
| ``` {   "labelId": string,   "fields": [     {       object (ClassificationLabelFieldValue)     }   ] } ``` |

| Fields | |
| --- | --- |
| `labelId` | `string`  Required. The canonical or raw alphanumeric classification label ID. Maps to the ID field of the Google Drive Label resource. |
| `fields[]` | `object (ClassificationLabelFieldValue)`  Field values for the given classification label ID. |

### ClassificationLabelFieldValue

Field values for a classification label.

| JSON representation |
| --- |
| ``` {   "fieldId": string,   "selection": string } ``` |

| Fields | |
| --- | --- |
| `fieldId` | `string`  Required. The field ID for the Classification Label Value. Maps to the ID field of the Google Drive `Label.Field` object. |
| `selection` | `string`  Selection choice ID for the selection option. Should only be set if the field type is `SELECTION` in the Google Drive `Label.Field` object. Maps to the id field of the Google Drive `Label.Field.SelectionOptions` resource. |

| Methods | |
| --- | --- |
| `batchDelete` | Deletes many messages by message ID. |
| `batchModify` | Modifies the labels on the specified messages. |
| `delete` | Immediately and permanently deletes the specified message. |
| `get` | Gets the specified message. |
| `import` | Imports a message into only this user's mailbox, with standard email delivery scanning and classification similar to receiving via SMTP. |
| `insert` | Directly inserts a message into only this user's mailbox similar to `IMAP APPEND`, bypassing most scanning and classification. |
| `list` | Lists the messages in the user's mailbox. |
| `modify` | Modifies the labels on the specified message. |
| `send` | Sends the specified message to the recipients in the `To`, `Cc`, and `Bcc` headers. |
| `trash` | Moves the specified message to the trash. |
| `untrash` | Removes the specified message from the trash. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages.attachments

Send feedback

# REST Resource: users.messages.attachments Stay organized with collections Save and categorize content based on your preferences.

* [Resource: MessagePartBody](#MessagePartBody)
  + [JSON representation](#MessagePartBody.SCHEMA_REPRESENTATION)
* [Methods](#METHODS_SUMMARY)

## Resource: MessagePartBody

The body of a single MIME message part.

| JSON representation |
| --- |
| ``` {   "attachmentId": string,   "size": integer,   "data": string } ``` |

| Fields | |
| --- | --- |
| `attachmentId` | `string`  When present, contains the ID of an external attachment that can be retrieved in a separate `messages.attachments.get` request. When not present, the entire content of the message part body is contained in the data field. |
| `size` | `integer`  Number of bytes for the message part data (encoding notwithstanding). |
| `data` | `string (bytes format)`  The body data of a MIME message part as a base64url encoded string. May be empty for MIME container types that have no message body or when the body data is sent as a separate attachment. An attachment ID is present if the body data is contained in a separate attachment.  A base64-encoded string. |

| Methods | |
| --- | --- |
| `get` | Gets the specified message attachment. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/Place

Send feedback

# Place Stay organized with collections Save and categorize content based on your preferences.

Type name: [Place](/workspace/gmail/markup/reference/types/Place)

Extends [Thing](/workspace/gmail/markup/reference/types/Thing)

| Name | Type | Description |
| --- | --- | --- |
| address | [PostalAddress](/workspace/gmail/markup/reference/types/PostalAddress) | Physical address of the item. |
| aggregateRating | [AggregateRating](/workspace/gmail/markup/reference/types/AggregateRating) | The overall rating, based on a collection of reviews or ratings, of the item. |
| containedIn | [Place](/workspace/gmail/markup/reference/types/Place) | The basic containment relation between places. |
| event | [Event](/workspace/gmail/markup/reference/types/Event) | The event information. |
| events | [Event](/workspace/gmail/markup/reference/types/Event) | Upcoming or past events associated with this place or organization. |
| faxNumber | [Text](/workspace/gmail/markup/reference/types/Text) | The fax number. |
| geo | [GeoCoordinates](/workspace/gmail/markup/reference/types/GeoCoordinates) or [GeoShape](/workspace/gmail/markup/reference/types/GeoShape) | The geo coordinates of the place. |
| globalLocationNumber | [Text](/workspace/gmail/markup/reference/types/Text) | The Global Location Number (GLN, sometimes also referred to as International Location Number or ILN) of the respective organization, person, or place. The GLN is a 13-digit number used to identify parties and physical locations. |
| hasMap | [Map](/workspace/gmail/markup/reference/types/Map) or [URL](/workspace/gmail/markup/reference/types/URL) | A URL to a map of the place. |
| interactionCount | [Text](/workspace/gmail/markup/reference/types/Text) | A count of a specific user interactions with this item—for example, `20 UserLikes`, `5 UserComments`, or `300 UserDownloads`. The user interaction type should be one of the sub types of [UserInteraction](/workspace/gmail/markup/reference/types/UserInteraction). |
| isicV4 | [Text](/workspace/gmail/markup/reference/types/Text) | The International Standard of Industrial Classification of All Economic Activities (ISIC), Revision 4 code for a particular organization, business person, or place. |
| logo | [ImageObject](/workspace/gmail/markup/reference/types/ImageObject) or [URL](/workspace/gmail/markup/reference/types/URL) | An associated logo. |
| map | [URL](/workspace/gmail/markup/reference/types/URL) | A URL to a map of the place. |
| maps | [URL](/workspace/gmail/markup/reference/types/URL) | A URL to a map of the place. |
| openingHoursSpecification | [OpeningHoursSpecification](/workspace/gmail/markup/reference/types/OpeningHoursSpecification) | The opening hours of a certain place. |
| photo | [ImageObject](/workspace/gmail/markup/reference/types/ImageObject) or [Photograph](/workspace/gmail/markup/reference/types/Photograph) | A photograph of this place. |
| photos | [ImageObject](/workspace/gmail/markup/reference/types/ImageObject) or [Photograph](/workspace/gmail/markup/reference/types/Photograph) | Photographs of this place. |
| review | [Review](/workspace/gmail/markup/reference/types/Review) | The review. |
| reviews | [Review](/workspace/gmail/markup/reference/types/Review) | Review of the item. |
| telephone | [Text](/workspace/gmail/markup/reference/types/Text) | The telephone number. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.settings.cse.identities/create

Send feedback

# Method: users.settings.cse.identities.create Stay organized with collections Save and categorize content based on your preferences.

* [HTTP request](#body.HTTP_TEMPLATE)
* [Path parameters](#body.PATH_PARAMETERS)
* [Request body](#body.request_body)
* [Response body](#body.response_body)
* [Authorization scopes](#body.aspect)
* [Try it!](#try-it)

Creates and configures a client-side encryption identity that's authorized to send mail from the user account. Google publishes the S/MIME certificate to a shared domain-wide directory so that people within a Google Workspace organization can encrypt and send mail to the identity.

For administrators managing identities and keypairs for users in their organization, requests require authorization with a [service account](https://developers.google.com/identity/protocols/OAuth2ServiceAccount) that has [domain-wide delegation authority](https://developers.google.com/identity/protocols/OAuth2ServiceAccount#delegatingauthority) to impersonate users with the `https://www.googleapis.com/auth/gmail.settings.basic` scope.

For users managing their own identities and keypairs, requests require [hardware key encryption](https://support.google.com/a/answer/14153163) turned on and configured.

### HTTP request

`POST https://gmail.googleapis.com/gmail/v1/users/{userId}/settings/cse/identities`

The URL uses [gRPC Transcoding](https://google.aip.dev/127) syntax.

### Path parameters

| Parameters | |
| --- | --- |
| `userId` | `string`  The requester's primary email address. To indicate the authenticated user, you can use the special value `me`. |

### Request body

The request body contains an instance of `CseIdentity`.

### Response body

If successful, the response body contains a newly created instance of `CseIdentity`.

### Authorization scopes

Requires one of the following OAuth scopes:

* `https://www.googleapis.com/auth/gmail.settings.basic`
* `https://www.googleapis.com/auth/gmail.settings.sharing`

For more information, see the [OAuth 2.0 Overview](/identity/protocols/OAuth2).




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/HobbyShop

Send feedback

# HobbyShop Stay organized with collections Save and categorize content based on your preferences.

Type name: [HobbyShop](/workspace/gmail/markup/reference/types/HobbyShop)

Extends [Store](/workspace/gmail/markup/reference/types/Store)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/MusicReleaseFormatType

Send feedback

# MusicReleaseFormatType Stay organized with collections Save and categorize content based on your preferences.

Type name: [MusicReleaseFormatType](/workspace/gmail/markup/reference/types/MusicReleaseFormatType)

Extends [Enumeration](/workspace/gmail/markup/reference/types/Enumeration)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/Vessel

Send feedback

# Vessel Stay organized with collections Save and categorize content based on your preferences.

Type name: [Vessel](/workspace/gmail/markup/reference/types/Vessel)

Extends [AnatomicalStructure](/workspace/gmail/markup/reference/types/AnatomicalStructure)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/MusicAlbumProductionType

Send feedback

# MusicAlbumProductionType Stay organized with collections Save and categorize content based on your preferences.

Type name: [MusicAlbumProductionType](/workspace/gmail/markup/reference/types/MusicAlbumProductionType)

Extends [Enumeration](/workspace/gmail/markup/reference/types/Enumeration)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/GovernmentPermit

Send feedback

# GovernmentPermit Stay organized with collections Save and categorize content based on your preferences.

Type name: [GovernmentPermit](/workspace/gmail/markup/reference/types/GovernmentPermit)

Extends [Permit](/workspace/gmail/markup/reference/types/Permit)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/VeterinaryCare

Send feedback

# VeterinaryCare Stay organized with collections Save and categorize content based on your preferences.

Type name: [VeterinaryCare](/workspace/gmail/markup/reference/types/VeterinaryCare)

Extends [MedicalOrganization](/workspace/gmail/markup/reference/types/MedicalOrganization)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.settings.sendAs.smimeInfo/insert

Send feedback

# Method: users.settings.sendAs.smimeInfo.insert Stay organized with collections Save and categorize content based on your preferences.

* [HTTP request](#body.HTTP_TEMPLATE)
* [Path parameters](#body.PATH_PARAMETERS)
* [Request body](#body.request_body)
* [Response body](#body.response_body)
* [Authorization scopes](#body.aspect)
* [Try it!](#try-it)

Insert (upload) the given S/MIME config for the specified send-as alias. Note that pkcs12 format is required for the key.

### HTTP request

`POST https://gmail.googleapis.com/gmail/v1/users/{userId}/settings/sendAs/{sendAsEmail}/smimeInfo`

The URL uses [gRPC Transcoding](https://google.aip.dev/127) syntax.

### Path parameters

| Parameters | |
| --- | --- |
| `userId` | `string`  The user's email address. The special value `me` can be used to indicate the authenticated user. |
| `sendAsEmail` | `string`  The email address that appears in the "From:" header for mail sent using this alias. |

### Request body

The request body contains an instance of `SmimeInfo`.

### Response body

If successful, the response body contains a newly created instance of `SmimeInfo`.

### Authorization scopes

Requires one of the following OAuth scopes:

* `https://www.googleapis.com/auth/gmail.settings.basic`
* `https://www.googleapis.com/auth/gmail.settings.sharing`

For more information, see the [OAuth 2.0 Overview](/identity/protocols/OAuth2).




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/Restaurant

Send feedback

# Restaurant Stay organized with collections Save and categorize content based on your preferences.

Type name: [Restaurant](/workspace/gmail/markup/reference/types/Restaurant)

Extends [FoodEstablishment](/workspace/gmail/markup/reference/types/FoodEstablishment)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/FoodEvent

Send feedback

# FoodEvent Stay organized with collections Save and categorize content based on your preferences.

Type name: [FoodEvent](/workspace/gmail/markup/reference/types/FoodEvent)

Extends [Event](/workspace/gmail/markup/reference/types/Event)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/RecyclingCenter

Send feedback

# RecyclingCenter Stay organized with collections Save and categorize content based on your preferences.

Type name: [RecyclingCenter](/workspace/gmail/markup/reference/types/RecyclingCenter)

Extends [LocalBusiness](/workspace/gmail/markup/reference/types/LocalBusiness)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/MusicRecording

Send feedback

# MusicRecording Stay organized with collections Save and categorize content based on your preferences.

Type name: [MusicRecording](/workspace/gmail/markup/reference/types/MusicRecording)

Extends [CreativeWork](/workspace/gmail/markup/reference/types/CreativeWork)

| Name | Type | Description |
| --- | --- | --- |
| byArtist | [MusicGroup](/workspace/gmail/markup/reference/types/MusicGroup) | The artist that performed this album or recording. |
| duration | [Duration](/workspace/gmail/markup/reference/types/Duration) | The duration of the item (movie, audio recording, event, etc.) in [ISO 8601 date format](http://en.wikipedia.org/wiki/ISO_8601). |
| inAlbum | [MusicAlbum](/workspace/gmail/markup/reference/types/MusicAlbum) | The album to which this recording belongs. |
| inPlaylist | [MusicPlaylist](/workspace/gmail/markup/reference/types/MusicPlaylist) | The playlist to which this recording belongs. |
| isrcCode | [Text](/workspace/gmail/markup/reference/types/Text) | The International Standard Recording Code for the recording. |
| recordingOf | [MusicComposition](/workspace/gmail/markup/reference/types/MusicComposition) | The composition this track is a recording of. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/batchModify

Send feedback

# Method: users.messages.batchModify Stay organized with collections Save and categorize content based on your preferences.

* [HTTP request](#body.HTTP_TEMPLATE)
* [Path parameters](#body.PATH_PARAMETERS)
* [Request body](#body.request_body)
  + [JSON representation](#body.request_body.SCHEMA_REPRESENTATION)
* [Response body](#body.response_body)
* [Authorization scopes](#body.aspect)
* [Try it!](#try-it)

Modifies the labels on the specified messages.

### HTTP request

`POST https://gmail.googleapis.com/gmail/v1/users/{userId}/messages/batchModify`

The URL uses [gRPC Transcoding](https://google.aip.dev/127) syntax.

### Path parameters

| Parameters | |
| --- | --- |
| `userId` | `string`  The user's email address. The special value `me` can be used to indicate the authenticated user. |

### Request body

The request body contains data with the following structure:

| JSON representation |
| --- |
| ``` {   "ids": [     string   ],   "addLabelIds": [     string   ],   "removeLabelIds": [     string   ] } ``` |

| Fields | |
| --- | --- |
| `ids[]` | `string`  The IDs of the messages to modify. There is a limit of 1000 ids per request. |
| `addLabelIds[]` | `string`  A list of label IDs to add to messages. |
| `removeLabelIds[]` | `string`  A list of label IDs to remove from messages. |

### Response body

If successful, the response body is empty.

### Authorization scopes

Requires one of the following OAuth scopes:

* `https://mail.google.com/`
* `https://www.googleapis.com/auth/gmail.modify`

For more information, see the [OAuth 2.0 Overview](/identity/protocols/OAuth2).




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/api/downloads

Send feedback

# Gmail API Client Libraries Stay organized with collections Save and categorize content based on your preferences.

The Gmail API is built on HTTP and JSON, so any standard HTTP client can
send requests to it and parse the responses.

However, the Google APIs client libraries provide better language integration,
improved security, and support for making calls that require user authorization.
The client libraries are available in a number of programming languages; by
using them you can avoid the need to manually set up HTTP requests and parse the
responses.

[Go](#go)[Java](#java)[JavaScript](#javascript)[.NET](#.net)[Node.js](#node.js)[Obj-C](#obj-c)[PHP](#php)[Python](#python)[Ruby](#ruby)
More

Get the latest [Gmail API client library for Go](https://github.com/google/google-api-go-client). Read the
client library's [developer's guide](https://github.com/google/google-api-go-client).

This page contains information about getting started with the Gmail API by using
the Google API Client Library for Java. For more information, see the following documentation:

* Browse the [Javadoc reference for the Gmail API](https://googleapis.dev/java/google-api-services-gmail/latest/).
* Read the [Developer's Guide for the Google API Client Library for Java](https://github.com/googleapis/google-api-java-client/).

## Add the client library to your project

Select your build environment (Maven or Gradle) from the following tabs:

[Maven](#maven)[Gradle](#gradle)
More

Add the following to your `pom.xml` file:

See [all versions available on the Maven Central Repository](http://search.maven.org/#search%7Cgav%7C1%7Cg%3A%22com.google.apis%22%20AND%20a%3A%22google-api-services-gmail%22).

Add the following to your `build.gradle` file:

See [all versions available on the Maven Central Repository](http://search.maven.org/#search%7Cgav%7C1%7Cg%3A%22com.google.apis%22%20AND%20a%3A%22google-api-services-gmail%22).

Read the client library's [developer's guide](/api-client-library/javascript/start/start-js).

This page contains information about getting started with the Gmail API by using
the Google API Client Library for .NET. For more information, see the following documentation:

* Browse the [.NET reference documentation for the Gmail API](https://googleapis.dev/dotnet/Google.Apis/latest/api/Google.Apis.html).
* Read the [Developer's guide for the Google API Client Library for .NET](https://developers.google.com/api-client-library/dotnet/get_started).

## Downloading the library

Install the NuGet package:
[Google.Apis](https://www.nuget.org/packages/Google.Apis).

Get the latest [Gmail API client library for Node.js](https://github.com/google/google-api-nodejs-client/). Read the
client library's [developer's guide](https://github.com/google/google-api-nodejs-client/).

Get the latest [Gmail API client library for Objective-C](https://github.com/google/google-api-objectivec-client-for-rest). Read the
client library's [developer's guide](https://github.com/google/google-api-objectivec-client-for-rest/wiki).

Get the latest [Gmail API client library for PHP](https://github.com/google/google-api-php-client). Read the
client library's [developer's guide](/api-client-library/php).

This page contains information about getting started with the Gmail API by using
the Google API Client Library for Python (v1/v2). For more information, see the following documentation:

* Browse the [PyDoc reference for the Gmail API](https://googleapis.github.io/google-api-python-client/docs/dyn/gmail_v1.html).
* Read the [Developer's guide for the Google API Client Library for Python (v1/v2)](/api-client-library/python).

## System requirements

* Operating systems:
  + Linux
  + macOS X
  + Windows
* [The v1 client library requires Python 2.7 or higher. The v2 client library requires 3.7 or higher.](http://python.org/download/)

## Install the client library

You can either use a package manager or manually download and install the Python client library:

### Managed install

Use pip or setuptools to manage your installation. You might
need to run `sudo` first.

* [pip](http://pypi.python.org/pypi/pip) (preferred):

  ```
  pip install --upgrade google-api-python-client
  ```
* [Setuptools](http://pypi.python.org/pypi/setuptools):

  ```
  easy_install --upgrade google-api-python-client
  ```

### Manual install

1. [Download the latest client
   library for Python](https://pypi.python.org/pypi/google-api-python-client/).
2. Unpack the code.
3. Install:

   ```
   python setup.py install
   ```

### App Engine

Because the Python client libraries aren't installed in the
[App Engine Python runtime environment](https://cloud.google.com/appengine/docs/python/),
you must [copy them into your application](https://cloud.google.com/appengine/docs/python/tools/libraries27#vendoring) just like third-party libraries.

This page contains information about getting started with the Gmail API by using
the Google API Client Library for Ruby. For more information, see the following documentation:

* Read the [Get started guide for the Google API Client Library for Ruby](/api-client-library/ruby/start/get_started).

## Install the `google-api-client` gem

Depending on your system, you might need to prepend these commands with `sudo`.

If you haven't installed the Google API Client Library for Ruby before, install by using `RubyGems`:

```
gem install google-api-client
```

If you already have the gem installed, update to the latest version:

```
gem update -y google-api-client
```

## Get started with the Google API Client Library for Ruby

To learn how to make your first request, see the
[Get started guide](/api-client-library/ruby/start/get_started).




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/MovieSeries

Send feedback

# MovieSeries Stay organized with collections Save and categorize content based on your preferences.

Type name: [MovieSeries](/workspace/gmail/markup/reference/types/MovieSeries)

Extends [Series](/workspace/gmail/markup/reference/types/Series)

| Name | Type | Description |
| --- | --- | --- |
| actor | [Person](/workspace/gmail/markup/reference/types/Person) | An actor, e.g. in tv, radio, movie, video games etc. Actors can be associated with individual items or with a series, episode, clip. |
| actors | [Person](/workspace/gmail/markup/reference/types/Person) | An actor, e.g. in tv, radio, movie, video games etc. Actors can be associated with individual items or with a series, episode, clip. |
| director | [Person](/workspace/gmail/markup/reference/types/Person) | A director of e.g. tv, radio, movie, video games etc. content. Directors can be associated with individual items or with a series, episode, clip. |
| directors | [Person](/workspace/gmail/markup/reference/types/Person) | A director of e.g. tv, radio, movie, video games etc. content. Directors can be associated with individual items or with a series, episode, clip. |
| musicBy | [MusicGroup](/workspace/gmail/markup/reference/types/MusicGroup) or [Person](/workspace/gmail/markup/reference/types/Person) | The composer of the soundtrack. |
| productionCompany | [Organization](/workspace/gmail/markup/reference/types/Organization) | The production company or studio responsible for the item e.g. series, video game, episode etc. |
| trailer | [VideoObject](/workspace/gmail/markup/reference/types/VideoObject) | The trailer of a movie or tv/radio series, season, episode, etc. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/AskAction

Send feedback

# AskAction Stay organized with collections Save and categorize content based on your preferences.

Type name: [AskAction](/workspace/gmail/markup/reference/types/AskAction)

Extends [CommunicateAction](/workspace/gmail/markup/reference/types/CommunicateAction)

| Name | Type | Description |
| --- | --- | --- |
| question | [Text](/workspace/gmail/markup/reference/types/Text) | A sub property of object. A question. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/ProductModel

Send feedback

# ProductModel Stay organized with collections Save and categorize content based on your preferences.

Type name: [ProductModel](/workspace/gmail/markup/reference/types/ProductModel)

Extends [Product](/workspace/gmail/markup/reference/types/Product)

| Name | Type | Description |
| --- | --- | --- |
| isVariantOf | [ProductModel](/workspace/gmail/markup/reference/types/ProductModel) | A pointer to a base product from which this product is a variant. It is safe to infer that the variant inherits all product features from the base model, unless defined locally. This is not transitive. |
| predecessorOf | [ProductModel](/workspace/gmail/markup/reference/types/ProductModel) | A pointer from a previous, often discontinued variant of the product to its newer variant. |
| successorOf | [ProductModel](/workspace/gmail/markup/reference/types/ProductModel) | A pointer from a newer variant of a product to its previous, often discontinued predecessor. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/Canal

Send feedback

# Canal Stay organized with collections Save and categorize content based on your preferences.

Type name: [Canal](/workspace/gmail/markup/reference/types/Canal)

Extends [BodyOfWater](/workspace/gmail/markup/reference/types/BodyOfWater)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/RiverBodyOfWater

Send feedback

# RiverBodyOfWater Stay organized with collections Save and categorize content based on your preferences.

Type name: [RiverBodyOfWater](/workspace/gmail/markup/reference/types/RiverBodyOfWater)

Extends [BodyOfWater](/workspace/gmail/markup/reference/types/BodyOfWater)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/PeopleAudience

Send feedback

# PeopleAudience Stay organized with collections Save and categorize content based on your preferences.

Type name: [PeopleAudience](/workspace/gmail/markup/reference/types/PeopleAudience)

Extends [Audience](/workspace/gmail/markup/reference/types/Audience)

| Name | Type | Description |
| --- | --- | --- |
| healthCondition | [MedicalCondition](/workspace/gmail/markup/reference/types/MedicalCondition) | Expectations for health conditions of target audience. |
| requiredGender | [Text](/workspace/gmail/markup/reference/types/Text) | Audiences defined by a person's gender. |
| requiredMaxAge | [Integer](/workspace/gmail/markup/reference/types/Integer) | Audiences defined by a person's maximum age. |
| requiredMinAge | [Integer](/workspace/gmail/markup/reference/types/Integer) | Audiences defined by a person's minimum age. |
| suggestedGender | [Text](/workspace/gmail/markup/reference/types/Text) | The gender of the person or audience. |
| suggestedMaxAge | [Number](/workspace/gmail/markup/reference/types/Number) | Maximal age recommended for viewing content. |
| suggestedMinAge | [Number](/workspace/gmail/markup/reference/types/Number) | Minimal age recommended for viewing content. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/PaymentMethod

Send feedback

# PaymentMethod Stay organized with collections Save and categorize content based on your preferences.

Type name: [PaymentMethod](/workspace/gmail/markup/reference/types/PaymentMethod)

Extends [Enumeration](/workspace/gmail/markup/reference/types/Enumeration)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/LikeAction

Send feedback

# LikeAction Stay organized with collections Save and categorize content based on your preferences.

Type name: [LikeAction](/workspace/gmail/markup/reference/types/LikeAction)

Extends [ReactAction](/workspace/gmail/markup/reference/types/ReactAction)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/Pond

Send feedback

# Pond Stay organized with collections Save and categorize content based on your preferences.

Type name: [Pond](/workspace/gmail/markup/reference/types/Pond)

Extends [BodyOfWater](/workspace/gmail/markup/reference/types/BodyOfWater)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/AutomotiveBusiness

Send feedback

# AutomotiveBusiness Stay organized with collections Save and categorize content based on your preferences.

Type name: [AutomotiveBusiness](/workspace/gmail/markup/reference/types/AutomotiveBusiness)

Extends [LocalBusiness](/workspace/gmail/markup/reference/types/LocalBusiness)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/android/com/google/android/gm/contentprovider/GmailContract.Labels.LabelCanonicalNames

Send feedback

# GmailContract.Labels.LabelCanonicalNames Stay organized with collections Save and categorize content based on your preferences.

public static final class
**GmailContract.Labels.LabelCanonicalNames**

Label canonical names for default Gmail system labels.

| Constants | | |
| --- | --- | --- |
| [CANONICAL\_NAME\_ALL\_MAIL](https://developers.google.com/workspace/gmail/android/com/google/android/gm/contentprovider/GmailContract.Labels.LabelCanonicalNames.html#CANONICAL_NAME_ALL_MAIL) |
| [CANONICAL\_NAME\_DRAFTS](https://developers.google.com/workspace/gmail/android/com/google/android/gm/contentprovider/GmailContract.Labels.LabelCanonicalNames.html#CANONICAL_NAME_DRAFTS) |
| [CANONICAL\_NAME\_INBOX](https://developers.google.com/workspace/gmail/android/com/google/android/gm/contentprovider/GmailContract.Labels.LabelCanonicalNames.html#CANONICAL_NAME_INBOX) |
| [CANONICAL\_NAME\_INBOX\_CATEGORY\_FORUMS](https://developers.google.com/workspace/gmail/android/com/google/android/gm/contentprovider/GmailContract.Labels.LabelCanonicalNames.html#CANONICAL_NAME_INBOX_CATEGORY_FORUMS) |
| [CANONICAL\_NAME\_INBOX\_CATEGORY\_PRIMARY](https://developers.google.com/workspace/gmail/android/com/google/android/gm/contentprovider/GmailContract.Labels.LabelCanonicalNames.html#CANONICAL_NAME_INBOX_CATEGORY_PRIMARY) |
| [CANONICAL\_NAME\_INBOX\_CATEGORY\_PROMOTIONS](https://developers.google.com/workspace/gmail/android/com/google/android/gm/contentprovider/GmailContract.Labels.LabelCanonicalNames.html#CANONICAL_NAME_INBOX_CATEGORY_PROMOTIONS) |
| [CANONICAL\_NAME\_INBOX\_CATEGORY\_SOCIAL](https://developers.google.com/workspace/gmail/android/com/google/android/gm/contentprovider/GmailContract.Labels.LabelCanonicalNames.html#CANONICAL_NAME_INBOX_CATEGORY_SOCIAL) |
| [CANONICAL\_NAME\_INBOX\_CATEGORY\_UPDATES](https://developers.google.com/workspace/gmail/android/com/google/android/gm/contentprovider/GmailContract.Labels.LabelCanonicalNames.html#CANONICAL_NAME_INBOX_CATEGORY_UPDATES) |
| [CANONICAL\_NAME\_PRIORITY\_INBOX](https://developers.google.com/workspace/gmail/android/com/google/android/gm/contentprovider/GmailContract.Labels.LabelCanonicalNames.html#CANONICAL_NAME_PRIORITY_INBOX) |
| [CANONICAL\_NAME\_SENT](https://developers.google.com/workspace/gmail/android/com/google/android/gm/contentprovider/GmailContract.Labels.LabelCanonicalNames.html#CANONICAL_NAME_SENT) |
| [CANONICAL\_NAME\_SPAM](https://developers.google.com/workspace/gmail/android/com/google/android/gm/contentprovider/GmailContract.Labels.LabelCanonicalNames.html#CANONICAL_NAME_SPAM) |
| [CANONICAL\_NAME\_STARRED](https://developers.google.com/workspace/gmail/android/com/google/android/gm/contentprovider/GmailContract.Labels.LabelCanonicalNames.html#CANONICAL_NAME_STARRED) |
| [CANONICAL\_NAME\_TRASH](https://developers.google.com/workspace/gmail/android/com/google/android/gm/contentprovider/GmailContract.Labels.LabelCanonicalNames.html#CANONICAL_NAME_TRASH) |







## Constants

#### public static final String **CANONICAL\_NAME\_ALL\_MAIL**

Canonical name for the All Mail label

Constant Value: 

"^all"

#### public static final String **CANONICAL\_NAME\_DRAFTS**

Canonical name for the Drafts label

Constant Value: 

"^r"

#### public static final String **CANONICAL\_NAME\_INBOX**

Canonical name for the Inbox label

*Note: This label may not exist, based on the user's inbox configuration*

Constant Value: 

"^i"

#### public static final String **CANONICAL\_NAME\_INBOX\_CATEGORY\_FORUMS**

Canonical name for the Forums inbox category

*Note: This label may not exist, based on the user's inbox configuration*

Constant Value: 

"^sq\_ig\_i\_group"

#### public static final String **CANONICAL\_NAME\_INBOX\_CATEGORY\_PRIMARY**

Canonical name for the Primary inbox category

*Note: This label may not exist, based on the user's inbox configuration*

Constant Value: 

"^sq\_ig\_i\_personal"

#### public static final String **CANONICAL\_NAME\_INBOX\_CATEGORY\_PROMOTIONS**

Canonical name for the Promotions inbox category

*Note: This label may not exist, based on the user's inbox configuration*

Constant Value: 

"^sq\_ig\_i\_promo"

#### public static final String **CANONICAL\_NAME\_INBOX\_CATEGORY\_SOCIAL**

Canonical name for the Social inbox category

*Note: This label may not exist, based on the user's inbox configuration*

Constant Value: 

"^sq\_ig\_i\_social"

#### public static final String **CANONICAL\_NAME\_INBOX\_CATEGORY\_UPDATES**

Canonical name for the Updates inbox category

*Note: This label may not exist, based on the user's inbox configuration*

Constant Value: 

"^sq\_ig\_i\_notification"

#### public static final String **CANONICAL\_NAME\_PRIORITY\_INBOX**

Canonical name for the Priority Inbox label

*Note: This label may not exist, based on the user's inbox configuration*

Constant Value: 

"^iim"

#### public static final String **CANONICAL\_NAME\_SENT**

Canonical name for the Sent label

Constant Value: 

"^f"

#### public static final String **CANONICAL\_NAME\_SPAM**

Canonical name for the Spam label

Constant Value: 

"^s"

#### public static final String **CANONICAL\_NAME\_STARRED**

Canonical name for the Starred label

Constant Value: 

"^t"

#### public static final String **CANONICAL\_NAME\_TRASH**

Canonical name for the Trash label

Constant Value: 

"^k"




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/postmaster/reference/rest/v2beta/domains/list

Send feedback

# Method: domains.list Stay organized with collections Save and categorize content based on your preferences.

* [HTTP request](#body.HTTP_TEMPLATE)
* [Query parameters](#body.QUERY_PARAMETERS)
* [Request body](#body.request_body)
* [Response body](#body.response_body)
  + [JSON representation](#body.ListDomainsResponse.SCHEMA_REPRESENTATION)
* [Authorization scopes](#body.aspect)

**Developer Preview:** Available as part of the [Google Workspace Developer Preview Program](https://developers.google.com/workspace/preview), which grants early access to certain features. Retrieves a list of all domains registered by you, along with their corresponding metadata. The order of domains in the response is unspecified and non-deterministic. Newly registered domains will not necessarily be added to the end of this list.

### HTTP request

`GET https://gmailpostmastertools.googleapis.com/v2beta/domains`

The URL uses [gRPC Transcoding](https://google.aip.dev/127) syntax.

### Query parameters

| Parameters | |
| --- | --- |
| `pageSize` | `integer`  Optional. Requested page size. Server may return fewer domains than requested. If unspecified, the default value for this field is 10. The maximum value for this field is 200. |
| `pageToken` | `string`  Optional. The nextPageToken value returned from a previous List request, if any. |

### Request body

The request body must be empty.

### Response body

Response message for domains.list.

**Developer Preview:** Available as part of the [Google Workspace Developer Preview Program](https://developers.google.com/workspace/preview), which grants early access to certain features.

If successful, the response body contains data with the following structure:

| JSON representation |
| --- |
| ``` {   "domains": [     {       object (Domain)     }   ],   "nextPageToken": string } ``` |

| Fields | |
| --- | --- |
| `domains[]` | `object (Domain)`  The domains that have been registered by the user. |
| `nextPageToken` | `string`  Token to retrieve the next page of results, or empty if there are no more results in the list. |

### Authorization scopes

Requires one of the following OAuth scopes:

* `https://www.googleapis.com/auth/postmaster`
* `https://www.googleapis.com/auth/postmaster.domain`

For more information, see the [Authorization guide](https://developers.google.com/workspace/guides/configure-oauth-consent).




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/MedicineSystem

Send feedback

# MedicineSystem Stay organized with collections Save and categorize content based on your preferences.

Type name: [MedicineSystem](/workspace/gmail/markup/reference/types/MedicineSystem)

Extends [Enumeration](/workspace/gmail/markup/reference/types/Enumeration) or [MedicalEnumeration](/workspace/gmail/markup/reference/types/MedicalEnumeration)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/School

Send feedback

# School Stay organized with collections Save and categorize content based on your preferences.

Type name: [School](/workspace/gmail/markup/reference/types/School)

Extends [EducationalOrganization](/workspace/gmail/markup/reference/types/EducationalOrganization)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/api/reference/rest/v1/users/getProfile

Send feedback

# Method: users.getProfile Stay organized with collections Save and categorize content based on your preferences.

* [HTTP request](#body.HTTP_TEMPLATE)
* [Path parameters](#body.PATH_PARAMETERS)
* [Request body](#body.request_body)
* [Response body](#body.response_body)
  + [JSON representation](#body.Profile.SCHEMA_REPRESENTATION)
* [Authorization scopes](#body.aspect)
* [Try it!](#try-it)

Gets the current user's Gmail profile.

### HTTP request

`GET https://gmail.googleapis.com/gmail/v1/users/{userId}/profile`

The URL uses [gRPC Transcoding](https://google.aip.dev/127) syntax.

### Path parameters

| Parameters | |
| --- | --- |
| `userId` | `string`  The user's email address. The special value `me` can be used to indicate the authenticated user. |

### Request body

The request body must be empty.

### Response body

Profile for a Gmail user.

If successful, the response body contains data with the following structure:

| JSON representation |
| --- |
| ``` {   "emailAddress": string,   "messagesTotal": integer,   "threadsTotal": integer,   "historyId": string } ``` |

| Fields | |
| --- | --- |
| `emailAddress` | `string`  The user's email address. |
| `messagesTotal` | `integer`  The total number of messages in the mailbox. |
| `threadsTotal` | `integer`  The total number of threads in the mailbox. |
| `historyId` | `string`  The ID of the mailbox's current history record. |

### Authorization scopes

Requires one of the following OAuth scopes:

* `https://mail.google.com/`
* `https://www.googleapis.com/auth/gmail.modify`
* `https://www.googleapis.com/auth/gmail.compose`
* `https://www.googleapis.com/auth/gmail.readonly`
* `https://www.googleapis.com/auth/gmail.metadata`

For more information, see the [OAuth 2.0 Overview](/identity/protocols/OAuth2).




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/modify

Send feedback

# Method: users.messages.modify Stay organized with collections Save and categorize content based on your preferences.

* [HTTP request](#body.HTTP_TEMPLATE)
* [Path parameters](#body.PATH_PARAMETERS)
* [Request body](#body.request_body)
  + [JSON representation](#body.request_body.SCHEMA_REPRESENTATION)
* [Response body](#body.response_body)
* [Authorization scopes](#body.aspect)
* [Try it!](#try-it)

Modifies the labels on the specified message.

### HTTP request

`POST https://gmail.googleapis.com/gmail/v1/users/{userId}/messages/{id}/modify`

The URL uses [gRPC Transcoding](https://google.aip.dev/127) syntax.

### Path parameters

| Parameters | |
| --- | --- |
| `userId` | `string`  The user's email address. The special value `me` can be used to indicate the authenticated user. |
| `id` | `string`  The ID of the message to modify. |

### Request body

The request body contains data with the following structure:

| JSON representation |
| --- |
| ``` {   "addLabelIds": [     string   ],   "removeLabelIds": [     string   ] } ``` |

| Fields | |
| --- | --- |
| `addLabelIds[]` | `string`  A list of IDs of labels to add to this message. You can add up to 100 labels with each update. |
| `removeLabelIds[]` | `string`  A list IDs of labels to remove from this message. You can remove up to 100 labels with each update. |

### Response body

If successful, the response body contains an instance of `Message`.

### Authorization scopes

Requires one of the following OAuth scopes:

* `https://mail.google.com/`
* `https://www.googleapis.com/auth/gmail.modify`

For more information, see the [OAuth 2.0 Overview](/identity/protocols/OAuth2).




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.history

Send feedback

# REST Resource: users.history Stay organized with collections Save and categorize content based on your preferences.

* [Resource](#RESOURCE_REPRESENTATION)
* [Methods](#METHODS_SUMMARY)

## Resource

There is no persistent data associated with this resource.

| Methods | |
| --- | --- |
| `list` | Lists the history of all changes to the given mailbox. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/postmaster/reference/rest

Send feedback

# Gmail Postmaster Tools API Stay organized with collections Save and categorize content based on your preferences.

The Postmaster Tools API is a RESTful API that provides programmatic access to email traffic metrics (like spam reports, delivery errors etc) otherwise available through the Gmail Postmaster Tools UI currently.

* [REST Resource: v1.domains](#v1.domains)
* [REST Resource: v1.domains.trafficStats](#v1.domains.trafficStats)

## Service: gmailpostmastertools.googleapis.com

To call this service, we recommend that you use the Google-provided [client libraries](https://cloud.google.com/apis/docs/client-libraries-explained). If your application needs to use your own libraries to call this service, use the following information when you make the API requests.

### Discovery document

A [Discovery Document](https://developers.google.com/discovery/v1/reference/apis) is a machine-readable specification for describing and consuming REST APIs. It is used to build client libraries, IDE plugins, and other tools that interact with Google APIs. One service may provide multiple discovery documents. This service provides the following discovery document:

* <https://gmailpostmastertools.googleapis.com/$discovery/rest?version=v1>

### Service endpoint

A [service endpoint](https://cloud.google.com/apis/design/glossary#api_service_endpoint) is a base URL that specifies the network address of an API service. One service might have multiple service endpoints. This service has the following service endpoint and all URIs below are relative to this service endpoint:

* `https://gmailpostmastertools.googleapis.com`

## REST Resource: [v1.domains](/workspace/gmail/postmaster/reference/rest/v1/domains)

| Methods | |
| --- | --- |
| `get` | `GET /v1/{name=domains/*}`   Gets a specific domain registered by the client. |
| `list` | `GET /v1/domains`   Lists the domains that have been registered by the client. |

## REST Resource: [v1.domains.trafficStats](/workspace/gmail/postmaster/reference/rest/v1/domains.trafficStats)

| Methods | |
| --- | --- |
| `get` | `GET /v1/{name=domains/*/trafficStats/*}`   Get traffic statistics for a domain on a specific date. |
| `list` | `GET /v1/{parent=domains/*}/trafficStats`   List traffic statistics for all available days. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/LendAction

Send feedback

# LendAction Stay organized with collections Save and categorize content based on your preferences.

Type name: [LendAction](/workspace/gmail/markup/reference/types/LendAction)

Extends [TransferAction](/workspace/gmail/markup/reference/types/TransferAction)

| Name | Type | Description |
| --- | --- | --- |
| borrower | [Person](/workspace/gmail/markup/reference/types/Person) | A sub property of participant. The person that borrows the object being lent. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/Airline

Send feedback

# Airline Stay organized with collections Save and categorize content based on your preferences.

Type name: [Airline](/workspace/gmail/markup/reference/types/Airline)

Extends [Organization](/workspace/gmail/markup/reference/types/Organization)

| Name | Type | Description |
| --- | --- | --- |
| iataCode | [Text](/workspace/gmail/markup/reference/types/Text) | IATA identifier for an airline or airport. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/TipAction

Send feedback

# TipAction Stay organized with collections Save and categorize content based on your preferences.

Type name: [TipAction](/workspace/gmail/markup/reference/types/TipAction)

Extends [TradeAction](/workspace/gmail/markup/reference/types/TradeAction)

| Name | Type | Description |
| --- | --- | --- |
| recipient | [Audience](/workspace/gmail/markup/reference/types/Audience), [Organization](/workspace/gmail/markup/reference/types/Organization) or [Person](/workspace/gmail/markup/reference/types/Person) | A sub property of participant. The participant who is at the receiving end of the action. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/LegislativeBuilding

Send feedback

# LegislativeBuilding Stay organized with collections Save and categorize content based on your preferences.

Type name: [LegislativeBuilding](/workspace/gmail/markup/reference/types/LegislativeBuilding)

Extends [GovernmentBuilding](/workspace/gmail/markup/reference/types/GovernmentBuilding)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/SportsEvent

Send feedback

# SportsEvent Stay organized with collections Save and categorize content based on your preferences.

Type name: [SportsEvent](/workspace/gmail/markup/reference/types/SportsEvent)

Extends [Event](/workspace/gmail/markup/reference/types/Event)

| Name | Type | Description |
| --- | --- | --- |
| awayTeam | [Person](/workspace/gmail/markup/reference/types/Person) or [SportsTeam](/workspace/gmail/markup/reference/types/SportsTeam) | The away team in a sports event. |
| competitor | [Person](/workspace/gmail/markup/reference/types/Person) or [SportsTeam](/workspace/gmail/markup/reference/types/SportsTeam) | A competitor in a sports event. |
| homeTeam | [Person](/workspace/gmail/markup/reference/types/Person) or [SportsTeam](/workspace/gmail/markup/reference/types/SportsTeam) | The home team in a sports event. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/ReserveAction

Send feedback

# ReserveAction Stay organized with collections Save and categorize content based on your preferences.

Type name: [ReserveAction](/workspace/gmail/markup/reference/types/ReserveAction)

Extends [PlanAction](/workspace/gmail/markup/reference/types/PlanAction)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/train-reservation

Send feedback

# Train Reservation Stay organized with collections Save and categorize content based on your preferences.

## Use cases

The following use cases show common examples of how the `TrainReservation` schema is used. Use these examples to ensure that your markup is properly structured.

**Note:** Before you start, make sure you understand how to [embed schemas in emails](/workspace/gmail/markup/embedding-schemas-in-emails) and you are familiar with [testing schemas](/workspace/gmail/markup/testing-your-schema).

### Basic reservation confirmation

Embed the following markup in your email when you send a reservation confirmation.

The Google app will display the reservation details on the day of the journey and will notify the user of the time to leave to get to the train station on time (taking into account the transport mode, traffic etc). If you provide a check-in URL like in the example below, the Google app will display this to the user 24 hours prior to the trip to the user.

[JSON-LD](#json-ld)[Microdata](#microdata)
More

```
<script type="application/ld+json">
{
  "@context": "http://schema.org",
  "@type": "TrainReservation",
  "reservationNumber": "AB3XY2",
  "reservationStatus": "http://schema.org/ReservationConfirmed",
  "reservationFor": {
    "@type": "TrainTrip",
    "departureStation": {
      "@type": "TrainStation",
      "name": "Munich Central"
    },
    "departureTime": "2017-01-04T10:30:00+01:00",
    "arrivalStation": {
      "@type": "TrainStation",
      "name": "Paris Gare De Lyon"
    },
    "arrivalTime": "2017-01-04T03:10:00+01:00"
  }
}
</script>
```

```
<div itemscope itemtype="http://schema.org/TrainReservation">
  <meta itemprop="reservationNumber" content="AB3XY2"/>
  <link itemprop="reservationStatus" href="http://schema.org/ReservationConfirmed"/>
  <div itemprop="reservationFor" itemscope itemtype="http://schema.org/TrainTrip">
    <div itemprop="departureStation" itemscope itemtype="http://schema.org/TrainStation">
      <meta itemprop="name" content="Munich Central"/>
    </div>
    <meta itemprop="departureTime" content="2017-01-04T10:30:00+01:00"/>
    <div itemprop="arrivalStation" itemscope itemtype="http://schema.org/TrainStation">
      <meta itemprop="name" content="Paris Gare De Lyon"/>
    </div>
    <meta itemprop="arrivalTime" content="2017-01-04T03:10:00+01:00"/>
  </div>
</div>
```

### Boarding pass and ticket

In addition to a reservation confirmation you may trigger a Confirmation Card boarding pass in a separate email.

Confirmation cards can not only help the user get to the train station on time, but also surface the ticket to the user during the journey. For this, some additional fields need to be included in the markup. If there are additional fields required to board passengers, include them in the `additionalTicketText` field.

For tickets with no reserved seating, these fields are : `numSeats`, `ticketNumber`, `ticketToken`

[JSON-LD](#json-ld)[Microdata](#microdata)
More

```
<script type="application/ld+json">
{
  "@context": "http://schema.org",
  "@type": "TrainReservation",
  "reservationNumber": "AB3XY2",
  "underName": {
    "@type": "Person",
    "name": "Eva Green"
  },
  "reservationStatus": "http://schema.org/ReservationConfirmed",
  "reservationFor": {
    "@type": "TrainTrip",
    "departureStation": {
      "@type": "TrainStation",
      "name": "Munich Central"
    },
    "departureTime": "2017-01-04T10:30:00+01:00",
    "arrivalStation": {
      "@type": "TrainStation",
      "name": "Paris Gare De Lyon"
    },
    "arrivalTime": "2017-01-04T03:10:00+01:00"
  },
  "reservedTicket": {
    "@type": "Ticket",
    "underName": "Eva Green",
    "ticketNumber": "123XYZ",
    "ticketToken": "aztecCode:AB34",
    "additionalTicketText": "We recommend that you arrive at the station at least 30 minutes prior to your scheduled departure. Allow additional time if you need help with baggage or tickets."
  }
}
</script>
```

```
<div itemscope itemtype="http://schema.org/TrainReservation">
  <meta itemprop="reservationNumber" content="AB3XY2"/>
  <div itemprop="underName" itemscope itemtype="http://schema.org/Person">
    <meta itemprop="name" content="Eva Green"/>
  </div>
  <link itemprop="reservationStatus" href="http://schema.org/ReservationConfirmed"/>
  <div itemprop="reservationFor" itemscope itemtype="http://schema.org/TrainTrip">
    <div itemprop="departureStation" itemscope itemtype="http://schema.org/TrainStation">
      <meta itemprop="name" content="Munich Central"/>
    </div>
    <meta itemprop="departureTime" content="2017-01-04T10:30:00+01:00"/>
    <div itemprop="arrivalStation" itemscope itemtype="http://schema.org/TrainStation">
      <meta itemprop="name" content="Paris Gare De Lyon"/>
    </div>
    <meta itemprop="arrivalTime" content="2017-01-04T03:10:00+01:00"/>
  </div>
  <div itemprop="reservedTicket" itemscope itemtype="http://schema.org/Ticket">
    <meta itemprop="underName" content="Eva Green"/>
    <meta itemprop="ticketNumber" content="123XYZ"/>
    <meta itemprop="ticketToken" content="aztecCode:AB34"/>
    <meta itemprop="additionalTicketText" content="We recommend that you arrive at the station at least 30 minutes prior to your scheduled departure. Allow additional time if you need help with baggage or tickets."/>
  </div>
</div>
```

For tickets with reserved seating, these fields are : `seatNumber`, `seatingType`, `ticketNumber`, `ticketToken`

[JSON-LD](#json-ld)[Microdata](#microdata)
More

```
<script type="application/ld+json">
{
  "@context": "http://schema.org",
  "@type": "TrainReservation",
  "reservationNumber": "AB3XY2",
  "underName": {
    "@type": "Person",
    "name": "Eva Green"
  },
  "reservationStatus": "http://schema.org/ReservationConfirmed",
  "reservationFor": {
    "@type": "TrainTrip",
    "departureStation": {
      "@type": "TrainStation",
      "name": "Munich Central"
    },
    "departureTime": "2017-01-04T10:30:00+01:00",
    "arrivalStation": {
      "@type": "TrainStation",
      "name": "Paris Gare De Lyon"
    },
    "arrivalTime": "2017-01-04T03:10:00+01:00"
  },
  "reservedTicket": {
    "@type": "Ticket",
    "underName": "Eva Green",
    "ticketedSeat": {
      "@type": "Seat",
      "seatNumber": "27B",
      "seatingType": "1st Class"
    },
    "ticketNumber": "123XYZ",
    "ticketToken": "aztecCode:AB34",
    "additionalTicketText": "We recommend that you arrive at the station at least 30 minutes prior to your scheduled departure. Allow additional time if you need help with baggage or tickets."
  }
}
</script>
```

```
<div itemscope itemtype="http://schema.org/TrainReservation">
  <meta itemprop="reservationNumber" content="AB3XY2"/>
  <div itemprop="underName" itemscope itemtype="http://schema.org/Person">
    <meta itemprop="name" content="Eva Green"/>
  </div>
  <link itemprop="reservationStatus" href="http://schema.org/ReservationConfirmed"/>
  <div itemprop="reservationFor" itemscope itemtype="http://schema.org/TrainTrip">
    <div itemprop="departureStation" itemscope itemtype="http://schema.org/TrainStation">
      <meta itemprop="name" content="Munich Central"/>
    </div>
    <meta itemprop="departureTime" content="2017-01-04T10:30:00+01:00"/>
    <div itemprop="arrivalStation" itemscope itemtype="http://schema.org/TrainStation">
      <meta itemprop="name" content="Paris Gare De Lyon"/>
    </div>
    <meta itemprop="arrivalTime" content="2017-01-04T03:10:00+01:00"/>
  </div>
  <div itemprop="reservedTicket" itemscope itemtype="http://schema.org/Ticket">
    <meta itemprop="underName" content="Eva Green"/>
    <div itemprop="ticketedSeat" itemscope itemtype="http://schema.org/Seat">
      <meta itemprop="seatNumber" content="27B"/>
      <meta itemprop="seatingType" content="1st Class"/>
    </div>
    <meta itemprop="ticketNumber" content="123XYZ"/>
    <meta itemprop="ticketToken" content="aztecCode:AB34"/>
    <meta itemprop="additionalTicketText" content="We recommend that you arrive at the station at least 30 minutes prior to your scheduled departure. Allow additional time if you need help with baggage or tickets."/>
  </div>
</div>
```

### Multiple passengers

To describe a booking involving multiple passengers, use one `TrainReservation` per passenger per leg.

[JSON-LD](#json-ld)[Microdata](#microdata)
More

```
<script type="application/ld+json">
[
  {
    "@context": "http://schema.org",
    "@type": "TrainReservation",
    "reservationNumber": "AB3XY2",
    "reservationStatus": "http://schema.org/ReservationConfirmed",
    "reservationFor": {
      "@type": "TrainTrip",
      "departureStation": {
        "@type": "TrainStation",
        "name": "Munich Central"
      },
      "departureTime": "2017-01-04T10:30:00+01:00",
      "arrivalStation": {
        "@type": "TrainStation",
        "name": "Paris Gare De Lyon"
      },
      "arrivalTime": "2017-01-04T03:10:00+01:00"
    },
    "reservedTicket": {
      "@type": "Ticket",
      "underName": {
        "@type": "Person",
        "name": "Eva Green"
      }
    }
  },
  {
    "@context": "http://schema.org",
    "@type": "TrainReservation",
    "reservationNumber": "AB3XY2",
    "reservationStatus": "http://schema.org/ReservationConfirmed",
    "reservationFor": {
      "@type": "TrainTrip",
      "departureStation": {
        "@type": "TrainStation",
        "name": "Munich Central"
      },
      "departureTime": "2017-01-04T10:30:00+01:00",
      "arrivalStation": {
        "@type": "TrainStation",
        "name": "Paris Gare De Lyon"
      },
      "arrivalTime": "2017-01-04T03:10:00+01:00"
    },
    "reservedTicket": {
      "@type": "Ticket",
      "underName": {
        "@type": "Person",
        "name": "John Green"
      }
    }
  },
  {
    "@context": "http://schema.org",
    "@type": "TrainReservation",
    "reservationNumber": "AB3XY2",
    "reservationStatus": "http://schema.org/ReservationConfirmed",
    "reservationFor": {
      "@type": "TrainTrip",
      "departureStation": {
        "@type": "TrainStation",
        "name": "Munich Central"
      },
      "departureTime": "2017-01-04T10:30:00+01:00",
      "arrivalStation": {
        "@type": "TrainStation",
        "name": "Paris Gare De Lyon"
      },
      "arrivalTime": "2017-01-04T03:10:00+01:00"
    },
    "reservedTicket": {
      "@type": "Ticket",
      "underName": {
        "@type": "Person",
        "name": "Carol Green"
      }
    }
  },
  {
    "@context": "http://schema.org",
    "@type": "TrainReservation",
    "reservationNumber": "AB3XY2",
    "reservationStatus": "http://schema.org/ReservationConfirmed",
    "reservationFor": {
      "@type": "TrainTrip",
      "departureStation": {
        "@type": "TrainStation",
        "name": "Munich Central"
      },
      "departureTime": "2017-01-04T10:30:00+01:00",
      "arrivalStation": {
        "@type": "TrainStation",
        "name": "Paris Gare De Lyon"
      },
      "arrivalTime": "2017-01-04T03:10:00+01:00"
    },
    "reservedTicket": {
      "@type": "Ticket",
      "underName": {
        "@type": "Person",
        "name": "Daniel Green"
      }
    }
  }
]
</script>
```

```
<div itemscope itemtype="http://schema.org/TrainReservation">
  <meta itemprop="reservationNumber" content="AB3XY2"/>
  <link itemprop="reservationStatus" href="http://schema.org/ReservationConfirmed"/>
  <div itemprop="reservationFor" itemscope itemtype="http://schema.org/TrainTrip">
    <div itemprop="departureStation" itemscope itemtype="http://schema.org/TrainStation">
      <meta itemprop="name" content="Munich Central"/>
    </div>
    <meta itemprop="departureTime" content="2017-01-04T10:30:00+01:00"/>
    <div itemprop="arrivalStation" itemscope itemtype="http://schema.org/TrainStation">
      <meta itemprop="name" content="Paris Gare De Lyon"/>
    </div>
    <meta itemprop="arrivalTime" content="2017-01-04T03:10:00+01:00"/>
  </div>
  <div itemprop="reservedTicket" itemscope itemtype="http://schema.org/Ticket">
    <div itemprop="underName" itemscope itemtype="http://schema.org/Person">
      <meta itemprop="name" content="Eva Green"/>
    </div>
  </div>
</div>
<div itemscope itemtype="http://schema.org/TrainReservation">
  <meta itemprop="reservationNumber" content="AB3XY2"/>
  <link itemprop="reservationStatus" href="http://schema.org/ReservationConfirmed"/>
  <div itemprop="reservationFor" itemscope itemtype="http://schema.org/TrainTrip">
    <div itemprop="departureStation" itemscope itemtype="http://schema.org/TrainStation">
      <meta itemprop="name" content="Munich Central"/>
    </div>
    <meta itemprop="departureTime" content="2017-01-04T10:30:00+01:00"/>
    <div itemprop="arrivalStation" itemscope itemtype="http://schema.org/TrainStation">
      <meta itemprop="name" content="Paris Gare De Lyon"/>
    </div>
    <meta itemprop="arrivalTime" content="2017-01-04T03:10:00+01:00"/>
  </div>
  <div itemprop="reservedTicket" itemscope itemtype="http://schema.org/Ticket">
    <div itemprop="underName" itemscope itemtype="http://schema.org/Person">
      <meta itemprop="name" content="John Green"/>
    </div>
  </div>
</div>
<div itemscope itemtype="http://schema.org/TrainReservation">
  <meta itemprop="reservationNumber" content="AB3XY2"/>
  <link itemprop="reservationStatus" href="http://schema.org/ReservationConfirmed"/>
  <div itemprop="reservationFor" itemscope itemtype="http://schema.org/TrainTrip">
    <div itemprop="departureStation" itemscope itemtype="http://schema.org/TrainStation">
      <meta itemprop="name" content="Munich Central"/>
    </div>
    <meta itemprop="departureTime" content="2017-01-04T10:30:00+01:00"/>
    <div itemprop="arrivalStation" itemscope itemtype="http://schema.org/TrainStation">
      <meta itemprop="name" content="Paris Gare De Lyon"/>
    </div>
    <meta itemprop="arrivalTime" content="2017-01-04T03:10:00+01:00"/>
  </div>
  <div itemprop="reservedTicket" itemscope itemtype="http://schema.org/Ticket">
    <div itemprop="underName" itemscope itemtype="http://schema.org/Person">
      <meta itemprop="name" content="Carol Green"/>
    </div>
  </div>
</div>
<div itemscope itemtype="http://schema.org/TrainReservation">
  <meta itemprop="reservationNumber" content="AB3XY2"/>
  <link itemprop="reservationStatus" href="http://schema.org/ReservationConfirmed"/>
  <div itemprop="reservationFor" itemscope itemtype="http://schema.org/TrainTrip">
    <div itemprop="departureStation" itemscope itemtype="http://schema.org/TrainStation">
      <meta itemprop="name" content="Munich Central"/>
    </div>
    <meta itemprop="departureTime" content="2017-01-04T10:30:00+01:00"/>
    <div itemprop="arrivalStation" itemscope itemtype="http://schema.org/TrainStation">
      <meta itemprop="name" content="Paris Gare De Lyon"/>
    </div>
    <meta itemprop="arrivalTime" content="2017-01-04T03:10:00+01:00"/>
  </div>
  <div itemprop="reservedTicket" itemscope itemtype="http://schema.org/Ticket">
    <div itemprop="underName" itemscope itemtype="http://schema.org/Person">
      <meta itemprop="name" content="Daniel Green"/>
    </div>
  </div>
</div>
```

### Example with all supported fields

For reference, here is an example with all supported fields populated:

[JSON-LD](#json-ld)[Microdata](#microdata)
More

```
<script type="application/ld+json">
{
  "@context": "http://schema.org",
  "@type": "TrainReservation",
  "reservationNumber": "AB3XY2",
  "url": "http://eurotravel/view/AB3XY2",
  "underName": {
    "@type": "Person",
    "name": "John Smith",
    "email": "john@mail.com"
  },
  "programMembership": {
    "@type": "ProgramMembership",
    "memberNumber": "12345",
    "program": "STA"
  },
  "bookingAgent": {
    "@type": "Organization",
    "name": "European Vacations",
    "url": "http://eurotravel/"
  },
  "bookingTime": "2013-01-14T13:05:00-05:00",
  "modifiedTime": "2013-03-14T13:05:00-05:00",
  "confirmReservationUrl": "http://eurotravel/confirm?id=AB3XY2",
  "cancelReservationUrl": "http://eurotravel/cancel?id=AB3XY2",
  "modifyReservationUrl": "http://eurotravel/edit?id=AB3XY2",
  "reservationStatus": "http://schema.org/ReservationConfirmed",
  "checkinUrl": "http://train.com/checkin?id=AB3XY2",
  "reservationFor": {
    "@type": "TrainTrip",
    "trainNumber": "9203",
    "trainName": "Orient Express",
    "trainCode": "iGTV",
    "trainCompany": {
      "@type": "Organization"
    },
    "departureStation": {
      "@type": "TrainStation",
      "name": "Munich Central"
    },
    "departurePlatform": "64",
    "departureTime": "2017-01-04T10:30:00+01:00",
    "arrivalStation": {
      "@type": "TrainStation",
      "name": "Paris Gare De Lyon"
    },
    "arrivalPlatform": "101B",
    "arrivalTime": "2017-01-04T03:10:00+01:00"
  },
  "reservedTicket": {
    "@type": "Ticket",
    "ticketNumber": "123XYZ",
    "downloadUrl": "?",
    "printUrl": "?",
    "ticketToken": "qrCode:123456789",
    "additionalTicketText": "?",
    "price": "135.00",
    "priceCurrency": "EUR",
    "underName": {
      "@type": "Person",
      "name": "Mary Smith"
    },
    "ticketedSeat": {
      "@type": "Seat",
      "seatingType": "1st Class",
      "seatNumber": "27",
      "seatRow": "A"
    }
  }
}
</script>
```

```
<div itemscope itemtype="http://schema.org/TrainReservation">
  <meta itemprop="reservationNumber" content="AB3XY2"/>
  <link itemprop="url" href="http://eurotravel/view/AB3XY2"/>
  <div itemprop="underName" itemscope itemtype="http://schema.org/Person">
    <meta itemprop="name" content="John Smith"/>
    <meta itemprop="email" content="john@mail.com"/>
  </div>
  <div itemprop="programMembership" itemscope itemtype="http://schema.org/ProgramMembership">
    <meta itemprop="memberNumber" content="12345"/>
    <meta itemprop="program" content="STA"/>
  </div>
  <div itemprop="bookingAgent" itemscope itemtype="http://schema.org/Organization">
    <meta itemprop="name" content="European Vacations"/>
    <link itemprop="url" href="http://eurotravel/"/>
  </div>
  <meta itemprop="bookingTime" content="2013-01-14T13:05:00-05:00"/>
  <meta itemprop="modifiedTime" content="2013-03-14T13:05:00-05:00"/>
  <link itemprop="confirmReservationUrl" href="http://eurotravel/confirm?id=AB3XY2"/>
  <link itemprop="cancelReservationUrl" href="http://eurotravel/cancel?id=AB3XY2"/>
  <link itemprop="modifyReservationUrl" href="http://eurotravel/edit?id=AB3XY2"/>
  <link itemprop="reservationStatus" href="http://schema.org/ReservationConfirmed"/>
  <link itemprop="checkinUrl" href="http://train.com/checkin?id=AB3XY2"/>
  <div itemprop="reservationFor" itemscope itemtype="http://schema.org/TrainTrip">
    <meta itemprop="trainNumber" content="9203"/>
    <meta itemprop="trainName" content="Orient Express"/>
    <meta itemprop="trainCode" content="iGTV"/>
    <div itemprop="trainCompany" itemscope itemtype="http://schema.org/Organization">
    </div>
    <div itemprop="departureStation" itemscope itemtype="http://schema.org/TrainStation">
      <meta itemprop="name" content="Munich Central"/>
    </div>
    <meta itemprop="departurePlatform" content="64"/>
    <meta itemprop="departureTime" content="2017-01-04T10:30:00+01:00"/>
    <div itemprop="arrivalStation" itemscope itemtype="http://schema.org/TrainStation">
      <meta itemprop="name" content="Paris Gare De Lyon"/>
    </div>
    <meta itemprop="arrivalPlatform" content="101B"/>
    <meta itemprop="arrivalTime" content="2017-01-04T03:10:00+01:00"/>
  </div>
  <div itemprop="reservedTicket" itemscope itemtype="http://schema.org/Ticket">
    <meta itemprop="ticketNumber" content="123XYZ"/>
    <meta itemprop="downloadUrl" content="?"/>
    <meta itemprop="printUrl" content="?"/>
    <meta itemprop="ticketToken" content="qrCode:123456789"/>
    <meta itemprop="additionalTicketText" content="?"/>
    <meta itemprop="price" content="135.00"/>
    <meta itemprop="priceCurrency" content="EUR"/>
    <div itemprop="underName" itemscope itemtype="http://schema.org/Person">
      <meta itemprop="name" content="Mary Smith"/>
    </div>
    <div itemprop="ticketedSeat" itemscope itemtype="http://schema.org/Seat">
      <meta itemprop="seatingType" content="1st Class"/>
      <meta itemprop="seatNumber" content="27"/>
      <meta itemprop="seatRow" content="A"/>
    </div>
  </div>
</div>
```

## Test your markup

You can validate your markup using the [Email Markup Tester Tool](https://www.google.com/webmasters/markup-tester/). Paste in your markup code and click the **Validate** button to scan the content and receive a report on any errors present.

## Specification

Review the details of your email to see if any of these properties apply to your train reservation. By marking up these additional properties you allow Google to display a much richer desciption of the train reservation to the user.

| Property | Type | Description |
| --- | --- | --- |
| reservationNumber | Text | (**required**) The number or id of the reservation. |
| url | URL | Web page where reservation can be viewed. |
| underName | [Person](/workspace/gmail/markup/reference/types/Person) or [Organization](/workspace/gmail/markup/reference/types/Organization) | The passenger. |
| underName.name | Text | (**recommended for confirmation cards/Search Answers**) Name of the Person. |
| underName.email | Text | Email address. |
| programMembership | [ProgramMembership](/workspace/gmail/markup/reference/types/ProgramMembership) | Any membership in a frequent flyer, hotel loyalty program, etc. being applied to the reservation. |
| programMembership.memberNumber | Text | The identifier of the membership. |
| programMembership.program | Text | The name of the program. |
| bookingAgent | [Organization](/workspace/gmail/markup/reference/types/Organization) or [Person](/workspace/gmail/markup/reference/types/Person) | Booking agent or agency. Also accepts a string (e.g. ""). |
| bookingAgent.name | Text | Name of the agent/service. |
| bookingAgent.url | URL | Website of the agent/service. |
| bookingTime | [DateTime](/workspace/gmail/markup/reference/types/DateTime) | Date the reservation was made. |
| modifiedTime | [DateTime](/workspace/gmail/markup/reference/types/DateTime) | (**recommended for confirmation cards/Search Answers**) Time the reservation was last modified. |
| confirmReservationUrl | URL | Web page where reservation can be confirmed. |
| cancelReservationUrl | URL | Web page where reservation can be cancelled. |
| modifyReservationUrl | URL | (**recommended for confirmation cards/Search Answers**) Web page where reservation can be modified. |
| reservationStatus | [ReservationStatus](/workspace/gmail/markup/reference/types/ReservationStatus) | (**required**) Current status of the reservation. |
| checkinUrl | URL | Webpage where the passenger can check in. |
| reservationFor | [TrainTrip](/workspace/gmail/markup/reference/types/TrainTrip) | (**required**) Information about the train trip. |
| reservationFor.trainNumber | Text | (**recommended for confirmation cards/Search Answers**) The number for the train. |
| reservationFor.trainName | Text | The name of the train. |
| reservationFor.trainCode | Text | The unique identifier for the train. |
| reservationFor.trainCompany | [Organization](/workspace/gmail/markup/reference/types/Organization) | The organization that operates the train. Also accepts a string (e.g. ""). |
| reservationFor.departureStation | [TrainStation](/workspace/gmail/markup/reference/types/TrainStation) | (**required**) The station where the train departs. |
| reservationFor.departureStation.name | Text | (**required**) Name of the TrainStation. |
| reservationFor.departurePlatform | Text | The platform where the train departs. |
| reservationFor.departureTime | [DateTime](/workspace/gmail/markup/reference/types/DateTime) | (**required**) The expected departure time. |
| reservationFor.arrivalStation | [TrainStation](/workspace/gmail/markup/reference/types/TrainStation) | (**required**) The station where the train ends. |
| reservationFor.arrivalStation.name | Text | (**required**) Name of the TrainStation. |
| reservationFor.arrivalPlatform | Text | The platform where the train arrives. |
| reservationFor.arrivalTime | [DateTime](/workspace/gmail/markup/reference/types/DateTime) | (**required**) The expected arrival time. |
| reservedTicket | [Ticket](/workspace/gmail/markup/reference/types/Ticket) | Ticket information. |
| reservedTicket.ticketNumber | Text | The number or id of the ticket. |
| reservedTicket.downloadUrl | URL | . |
| reservedTicket.printUrl | URL | . |
| reservedTicket.ticketToken | Text or URL | If the barcode image is hosted on your site, the value of the field is URL of the image, or a barcode or QR URI, such as "barcode128:AB34" (ISO-15417 barcodes), "qrCode:AB34" (QR codes), "aztecCode:AB34" (Aztec codes), "barcodeEAN:1234" (EAN codes) and "barcodeUPCA:1234" (UPCA codes). |
| reservedTicket.additionalTicketText | Text | Additional explanatory text about the ticket. |
| reservedTicket.price | Text | Total price of the ticket. |
| reservedTicket.priceCurrency | Text | The currency (in 3-letter ISO 4217 format) of the ticket's price. |
| reservedTicket.underName | [Person](/workspace/gmail/markup/reference/types/Person) or [Organization](/workspace/gmail/markup/reference/types/Organization) | The Person or Organization the ticket is for. |
| reservedTicket.underName.name | Text | Name of the Person. |
| reservedTicket.ticketedSeat | [Seat](/workspace/gmail/markup/reference/types/Seat) | The location of the reserved seat (e.g., 27B). . |
| reservedTicket.ticketedSeat.seatingType | Text | The type/class of the seat. |
| reservedTicket.ticketedSeat.seatNumber | Text | The location of the reserved seat. |
| reservedTicket.ticketedSeat.seatRow | Text | The row location of the reserved seat. |

**Note:** Some of the schemas used by Google are still going through the standardization process of [schema.org](http://schema.org), and therefore, may change in the future. [Learn More](/workspace/gmail/markup/reference/schema-org-proposals).




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/go-to-action

Send feedback

# Go-To Actions Stay organized with collections Save and categorize content based on your preferences.

Go-To Actions take the user to your website where the action can be completed. Unlike [One Click Actions](/workspace/gmail/markup/reference/one-click-action), go-to actions can be interacted with multiple times.

  
Go-to actions in Gmail.

## Use Cases

Go-To Actions currently supported by Gmail are:

* [ViewAction](#view_action)
* [TrackAction](#track_action)

More actions might be supported in the future.

**Note:** Before you start, make sure you understand how to [embed schemas in emails](/workspace/gmail/markup/embedding-schemas-in-emails) and you are familiar with [testing schemas](/workspace/gmail/markup/testing-your-schema).

## View Action

You can add a `ViewAction` button to emails requiring users to go to your site to complete the action.

The following declaration adds a `ViewAction` button to an email:

[JSON-LD](#json-ld)[Microdata](#microdata)
More

```
<script type="application/ld+json">
{
  "@context": "http://schema.org",
  "@type": "EmailMessage",
  "potentialAction": {
    "@type": "ViewAction",
    "url": "https://watch-movies.com/watch?movieId=abc123",
    "name": "Watch movie"
  },
  "description": "Watch the 'Avengers' movie online"
}
</script>
```

```
<div itemscope itemtype="http://schema.org/EmailMessage">
  <div itemprop="potentialAction" itemscope itemtype="http://schema.org/ViewAction">
    <link itemprop="target" href="https://watch-movies.com/watch?movieId=abc123"/>
    <meta itemprop="name" content="Watch movie"/>
  </div>
  <meta itemprop="description" content="Watch the 'Avengers' movie online"/>
</div>
```

### Publisher data

You can add details about the organization sending the email message by setting the `publisher` field:

[JSON-LD](#json-ld)[Microdata](#microdata)
More

```
<script type="application/ld+json">
{
  "@context": "http://schema.org",
  "@type": "EmailMessage",
  "description": "Watch the 'Avengers' movie online",
  "potentialAction": {
    "@type": "ViewAction",
    "url": "https://watch-movies.com/watch?movieId=abc123",
    "name": "Watch movie"
  },
  "publisher": {
    "@type": "Organization",
    "name": "Google Play",
    "url": "https://play.google.com",
    "url/googlePlus": "https://plus.google.com/106886664866983861036"
  }
}
</script>
```

```
<div itemscope itemtype="http://schema.org/EmailMessage">
  <meta itemprop="description" content="Watch the 'Avengers' movie online"/>
  <div itemprop="potentialAction" itemscope itemtype="http://schema.org/ViewAction">
    <link itemprop="target" href="https://watch-movies.com/watch?movieId=abc123"/>
    <meta itemprop="name" content="Watch movie"/>
  </div>
  <div itemprop="publisher" itemscope itemtype="http://schema.org/Organization">
    <meta itemprop="name" content="Google Play"/>
    <link itemprop="url" href="https://play.google.com"/>
    <link itemprop="url/googlePlus" href="https://plus.google.com/106886664866983861036"/>
  </div>
</div>
```

## Track Action

You may add a `TrackAction` button to emails requiring users to go to your site to track packages being delivered.

An action is automatically generated when you specify the `trackingUrl` property. To link directly to a mobile application,
also include a `TrackAction` as shown:

[JSON-LD](#json-ld)[Microdata](#microdata)
More

```
<script type="application/ld+json">
{
  "@context": "http://schema.org",
  "@type": "ParcelDelivery",
  "deliveryAddress": {
    "@type": "PostalAddress",
    "streetAddress": "24 Willie Mays Plaza",
    "addressLocality": "San Francisco",
    "addressRegion": "CA",
    "addressCountry": "US",
    "postalCode": "94107"
  },
  "expectedArrivalUntil": "2013-03-12T12:00:00-08:00",
  "carrier": {
    "@type": "Organization",
    "name": "FedEx"
  },
  "itemShipped": {
    "@type": "Product",
    "name": "iPod Mini"
  },
  "partOfOrder": {
    "@type": "Order",
    "orderNumber": "176057",
    "merchant": {
      "@type": "Organization",
      "name": "Bob Dole"
    }
  },
  "trackingUrl": "http://fedex.com/track/1234567890"
  "potentialAction": {
    "@type": "TrackAction",
    "target": "http://fedex.com/track/1234567890"
  },
}
</script>
```

```
<div itemscope itemtype="http://schema.org/ParcelDelivery">
  <div itemprop="deliveryAddress" itemscope itemtype="http://schema.org/PostalAddress">
    <meta itemprop="streetAddress" content="24 Willie Mays Plaza"/>
    <meta itemprop="addressLocality" content="San Francisco"/>
    <meta itemprop="addressRegion" content="CA"/>
    <meta itemprop="addressCountry" content="US"/>
    <meta itemprop="postalCode" content="94107"/>
  </div>
  <meta itemprop="expectedArrivalUntil" content="2013-03-12T12:00:00-08:00"/>
  <div itemprop="carrier" itemscope itemtype="http://schema.org/Organization">
    <meta itemprop="name" content="FedEx"/>
  </div>
  <div itemprop="itemShipped" itemscope itemtype="http://schema.org/Product">
    <meta itemprop="name" content="iPod Mini"/>
  </div>
  <div itemprop="partOfOrder" itemscope itemtype="http://schema.org/Order">
    <meta itemprop="orderNumber" content="176057"/>
    <div itemprop="merchant" itemscope itemtype="http://schema.org/Organization">
      <meta itemprop="name" content="Bob Dole"/>
    </div>
  </div>
  <link itemprop="trackingUrl" href="http://fedex.com/track/1234567890"/>
  <div itemprop="potentialAction" itemscope itemtype="http://schema.org/TrackAction">
    <link itemprop="target" href="http://fedex.com/track/1234567890"/>
  </div>
</div>
```

## Test your markup

You can validate your markup using the [Email Markup Tester Tool](https://www.google.com/webmasters/markup-tester/). Paste in your markup code and click the **Validate** button to scan the content and receive a report on any errors present.

## Specification

For a specification of the various go-to action types, see the documentation
for the specific type [ViewAction](/workspace/gmail/markup/reference/types/ViewAction) or
[TrackAction](/workspace/gmail/markup/reference/types/TrackAction).

**Note:** Some of the schemas used by Google are still going through the standardization process of [schema.org](http://schema.org), and therefore, may change in the future. [Learn More](/workspace/gmail/markup/reference/schema-org-proposals).




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/ItemAvailability

Send feedback

# ItemAvailability Stay organized with collections Save and categorize content based on your preferences.

Type name: [ItemAvailability](/workspace/gmail/markup/reference/types/ItemAvailability)

Extends [Enumeration](/workspace/gmail/markup/reference/types/Enumeration)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/hotel-reservation

Send feedback

# Hotel Reservation Stay organized with collections Save and categorize content based on your preferences.

Use this type to declare a reservation for one or more guests at a hotel or place of lodging.

## Use cases

The following use cases show common examples of how the `LodgingReservation` schema is used. Use these examples to ensure that your markup is properly structured.

**Note:** Before you start, make sure you understand how to [embed schemas in emails](/workspace/gmail/markup/embedding-schemas-in-emails) and you are familiar with [testing schemas](/workspace/gmail/markup/testing-your-schema).

### Basic Hotel Reservation

This is an example of the minimal amount of markup that will qualify your email as an LodgingReservation.

[JSON-LD](#json-ld)[Microdata](#microdata)
More

```
<script type="application/ld+json">
{
  "@context": "http://schema.org",
  "@type": "LodgingReservation",
  "reservationNumber": "abc456",
  "reservationStatus": "http://schema.org/Confirmed",
  "underName": {
    "@type": "Person",
    "name": "John Smith"
  },
  "reservationFor": {
    "@type": "LodgingBusiness",
    "name": "Hilton San Francisco Union Square",
    "address": {
      "@type": "PostalAddress",
      "streetAddress": "333 O'Farrell St",
      "addressLocality": "San Francisco",
      "addressRegion": "CA",
      "postalCode": "94102",
      "addressCountry": "US"
    },
    "telephone": "415-771-1400"
  },
  "checkinDate": "2027-04-11T16:00:00-08:00",
  "checkoutDate": "2027-04-13T11:00:00-08:00"
}
</script>
```

```
<div itemscope itemtype="http://schema.org/LodgingReservation">
  <meta itemprop="reservationNumber" content="abc456"/>
  <link itemprop="reservationStatus" href="http://schema.org/Confirmed"/>
  <div itemprop="underName" itemscope itemtype="http://schema.org/Person">
    <meta itemprop="name" content="John Smith"/>
  </div>
  <div itemprop="reservationFor" itemscope itemtype="http://schema.org/LodgingBusiness">
    <meta itemprop="name" content="Hilton San Francisco Union Square"/>
    <div itemprop="address" itemscope itemtype="http://schema.org/PostalAddress">
      <meta itemprop="streetAddress" content="333 O'Farrell St"/>
      <meta itemprop="addressLocality" content="San Francisco"/>
      <meta itemprop="addressRegion" content="CA"/>
      <meta itemprop="postalCode" content="94102"/>
      <meta itemprop="addressCountry" content="US"/>
    </div>
    <meta itemprop="telephone" content="415-771-1400"/>
  </div>
  <meta itemprop="checkinDate" content="2027-04-11T16:00:00-08:00"/>
  <meta itemprop="checkoutDate" content="2027-04-13T11:00:00-08:00"/>
</div>
```

## Test your markup

You can validate your markup using the [Email Markup Tester Tool](https://www.google.com/webmasters/markup-tester/). Paste in your markup code and click the **Validate** button to scan the content and receive a report on any errors present.

## Specification

Review the details of your email to see if any of these addional properties apply to your reservation. By marking up these additional properties you allow Google to display a much richer description of the lodging reservation to the user.

# LodgingReservation

Type name: [LodgingReservation](/workspace/gmail/markup/reference/types/LodgingReservation)

Extends [Reservation](/workspace/gmail/markup/reference/types/Reservation)

| Name | Type | Description |
| --- | --- | --- |
| **bookingAgent** | [Person](/workspace/gmail/markup/reference/types/Person) or [Organization](/workspace/gmail/markup/reference/types/Organization) | Booking agent or agency. Also accepts a string (e.g. ""). |
| bookingAgent.**name** | [Text](/workspace/gmail/markup/reference/types/Text) | Name of the agent/service. |
| bookingAgent.**url** | [URL](/workspace/gmail/markup/reference/types/URL) | Website of the agent/service. |
| **bookingTime** | [DateTime](/workspace/gmail/markup/reference/types/DateTime) | Date the reservation was made. |
| **cancelReservationUrl** | [URL](/workspace/gmail/markup/reference/types/URL) | Web page where reservation can be cancelled. |
| **checkinDate**  **(Required)** | [DateTime](/workspace/gmail/markup/reference/types/DateTime) | Checkin time. |
| **checkoutDate**  **(Required)** | [DateTime](/workspace/gmail/markup/reference/types/DateTime) | Checkout time. |
| **checkinUrl** | [URL](/workspace/gmail/markup/reference/types/URL) | Web page where the lodger can check in. |
| **confirmReservationUrl** | [URL](/workspace/gmail/markup/reference/types/URL) | Web page where reservation can be confirmed. |
| **lodgingUnitDescription** | [Text](/workspace/gmail/markup/reference/types/Text) | Textual description of the unit type (including suite vs. room, size of bed, etc.). |
| **modifiedTime** | [DateTime](/workspace/gmail/markup/reference/types/DateTime) | (recommended for Confirmation Cards/Search Answers) Time the reservation was last modified. |
| **modifyReservationUrl** | [URL](/workspace/gmail/markup/reference/types/URL) | (recommended for Confirmation Cards/Search Answers) Web page where reservation can be modified. |
| **numAdults** | [Number](/workspace/gmail/markup/reference/types/Number) | Number of adults who will be staying in the lodging unit. |
| **numChildren** | [Number](/workspace/gmail/markup/reference/types/Number) | Number of children who will be staying in the lodging unit. |
| **price** | [Text](/workspace/gmail/markup/reference/types/Text) | Total price of the LodgingReservation. |
| **priceCurrency** | [Text](/workspace/gmail/markup/reference/types/Text) | The currency (in 3-letter ISO 4217 format) of the LodgingReservation's price. |
| **programMembership** | [ProgramMembership](/workspace/gmail/markup/reference/types/ProgramMembership) | Any membership in a frequent flyer, hotel loyalty program, etc. being applied to the reservation. |
| programMembership.**memberNumber** | [Text](/workspace/gmail/markup/reference/types/Text) | The identifier of the membership. |
| programMembership.**program** | [Text](/workspace/gmail/markup/reference/types/Text) | The name of the program. |
| **reservationFor**  **(Required)** | [LodgingBusiness](/workspace/gmail/markup/reference/types/LodgingBusiness) | The lodging the reservation is at. |
| reservationFor.**address**  **(Required)** | [PostalAddress](/workspace/gmail/markup/reference/types/PostalAddress) | Address of the Address of lodging. |
| reservationFor.address.**addressCountry**  **(Required)** | [Text](/workspace/gmail/markup/reference/types/Text) or [Country](/workspace/gmail/markup/reference/types/Country) | Country of Address of lodging. |
| reservationFor.address.**addressLocality**  **(Required)** | [Text](/workspace/gmail/markup/reference/types/Text) | Locality (e.g. city) of Address of lodging. |
| reservationFor.address.**addressRegion**  **(Required)** | [Text](/workspace/gmail/markup/reference/types/Text) | Region (e.g. State) of Address of lodging. |
| reservationFor.address.**postalCode**  **(Required)** | [Text](/workspace/gmail/markup/reference/types/Text) | Postal code of Address of lodging. |
| reservationFor.address.**streetAddress**  **(Required)** | [Text](/workspace/gmail/markup/reference/types/Text) | Street address of Address of lodging. |
| reservationFor.**image** | [URL](/workspace/gmail/markup/reference/types/URL) | Photo of the lodging business. |
| reservationFor.**name**  **(Required)** | [Text](/workspace/gmail/markup/reference/types/Text) | Name of the Address of lodging. |
| reservationFor.**telephone**  **(Required)** | [Text](/workspace/gmail/markup/reference/types/Text) | Telephone number of the LodgingBusiness. |
| reservationFor.**url** | [URL](/workspace/gmail/markup/reference/types/URL) | Website of the lodging business. |
| **reservationNumber**  **(Required)** | [Text](/workspace/gmail/markup/reference/types/Text) | The number or id of the reservation. |
| **reservationStatus**  **(Required)** | [ReservationStatus](/workspace/gmail/markup/reference/types/ReservationStatus) | Current status of the reservation. |
| **underName**  **(Required)** | [Person](/workspace/gmail/markup/reference/types/Person) or [Organization](/workspace/gmail/markup/reference/types/Organization) | The guest. |
| underName.**email** | [Text](/workspace/gmail/markup/reference/types/Text) | Email address. |
| underName.**name**  **(Required)** | [Text](/workspace/gmail/markup/reference/types/Text) | Name of the Person. |
| **url** | [URL](/workspace/gmail/markup/reference/types/URL) | Web page where reservation can be viewed. |

**Note:** Some of the schemas used by Google are still going through the standardization process of [schema.org](http://schema.org), and therefore, may change in the future. [Learn More](/workspace/gmail/markup/reference/schema-org-proposals).




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/api/guides/quickstarts-overview

Send feedback

# JavaScript quickstart Stay organized with collections Save and categorize content based on your preferences.

Create a JavaScript web application that makes requests to the Gmail API.

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

* A Google account with Gmail enabled.

## Set up your environment

To complete this quickstart, set up your environment.

### Enable the API

Before using Google APIs, you need to turn them on in a Google Cloud project.
You can turn on one or more APIs in a single Google Cloud project.

* In the Google Cloud console, enable the Gmail API.

  [Enable the API](https://console.cloud.google.com/flows/enableapi?apiid=gmail.googleapis.com)

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

   gmail/quickstart/index.html

   [View on GitHub](https://github.com/googleworkspace/browser-samples/blob/main/gmail/quickstart/index.html)

   ```
   <!DOCTYPE html>
   <html>
     <head>
       <title>Gmail API Quickstart</title>
       <meta charset="utf-8" />
     </head>
     <body>
       <p>Gmail API Quickstart</p>

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
         const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/gmail/v1/rest';

         // Authorization scopes required by the API; multiple scopes can be
         // included, separated by spaces.
         const SCOPES = 'https://www.googleapis.com/auth/gmail.readonly';

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
             await listLabels();
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
          * Print all Labels in the authorized user's inbox. If no labels
          * are found an appropriate message is printed.
          */
         async function listLabels() {
           let response;
           try {
             response = await gapi.client.gmail.users.labels.list({
               'userId': 'me',
             });
           } catch (err) {
             document.getElementById('content').innerText = err.message;
             return;
           }
           const labels = response.result.labels;
           if (!labels || labels.length == 0) {
             document.getElementById('content').innerText = 'No labels found.';
             return;
           }
           // Flatten to string to display
           const output = labels.reduce(
               (str, label) => `${str}${label.name}\n`,
               'Labels:\n');
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

Your JavaScript application runs and calls the Gmail API.

## Next steps

* [Try the Google Workspace APIs in the APIs explorer](/workspace/explore)
  + [Troubleshoot authentication and authorization issues](/workspace/gmail/api/troubleshoot-authentication-authorization)
  + [Gmail API reference documentation](/workspace/gmail/api/reference/rest)
  + [`google-api-javascript-client` section of GitHub](/api-client-library/javascript)




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/Comment

Send feedback

# Comment Stay organized with collections Save and categorize content based on your preferences.

Type name: [Comment](/workspace/gmail/markup/reference/types/Comment)

Extends [CreativeWork](/workspace/gmail/markup/reference/types/CreativeWork)

| Name | Type | Description |
| --- | --- | --- |
| downvoteCount | [Integer](/workspace/gmail/markup/reference/types/Integer) | The number of downvotes this question has received from the community. |
| parentItem | [Question](/workspace/gmail/markup/reference/types/Question) | The parent of a question, answer or item in general. |
| upvoteCount | [Integer](/workspace/gmail/markup/reference/types/Integer) | The number of upvotes this question has received from the community. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/formats/json-ld

Send feedback

# JSON-LD Stay organized with collections Save and categorize content based on your preferences.

[JSON-LD](https://json-ld.org/) is an easy-to-use JSON-based linked data format that defines the concept of `context` to specify the vocabulary for types and properties. Gmail supports [JSON-LD data embedded in HTML documents](https://json-ld.org/spec/latest/json-ld/#embedding-json-ld-in-html-documents) with the `@context` of `schema.org`, as in the following example:

```
<script type="application/ld+json">
{
  "@context": "http://schema.org",
  "@type": "Person",
  "name": "John Doe",
  "jobTitle": "Graduate research assistant",
  "affiliation": "University of Dreams",
  "additionalName": "Johnny",
  "url": "http://www.example.com",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "1234 Peach Drive",
    "addressLocality": "Wonderland",
    "addressRegion": "Georgia"
  }
}
</script>
```

**Note:** the `@type` key is a reserved key name and should contain either a full type URI or a URI fragment (in which case a `http://schema.org/` prefix, derived from the supplied data-context attribute, is assumed).

The full specifications and requirements for the JSON-LD syntax are available on [json-ld.org](http://json-ld.org/), and you can also use our [Schema Validator](/workspace/gmail/markup/testing-your-schema#schema_validator) tool to try out JSON-LD and debug your markup.




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/Permit

Send feedback

# Permit Stay organized with collections Save and categorize content based on your preferences.

Type name: [Permit](/workspace/gmail/markup/reference/types/Permit)

Extends [Intangible](/workspace/gmail/markup/reference/types/Intangible)

| Name | Type | Description |
| --- | --- | --- |
| issuedBy | [Organization](/workspace/gmail/markup/reference/types/Organization) | The organization issuing the ticket or permit. |
| issuedThrough | [Service](/workspace/gmail/markup/reference/types/Service) | The service through with the permit was granted. |
| permitAudience | [Audience](/workspace/gmail/markup/reference/types/Audience) | The target audience for this permit. |
| validFor | [Duration](/workspace/gmail/markup/reference/types/Duration) | The time validity of the permit. |
| validFrom | [DateTime](/workspace/gmail/markup/reference/types/DateTime) | The date when the item becomes valid. |
| validIn | [AdministrativeArea](/workspace/gmail/markup/reference/types/AdministrativeArea) | The geographic area where the permit is valid. |
| validUntil | [Date](/workspace/gmail/markup/reference/types/Date) | The date when the item is no longer valid. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/ArriveAction

Send feedback

# ArriveAction Stay organized with collections Save and categorize content based on your preferences.

Type name: [ArriveAction](/workspace/gmail/markup/reference/types/ArriveAction)

Extends [MoveAction](/workspace/gmail/markup/reference/types/MoveAction)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/ReplaceAction

Send feedback

# ReplaceAction Stay organized with collections Save and categorize content based on your preferences.

Type name: [ReplaceAction](/workspace/gmail/markup/reference/types/ReplaceAction)

Extends [UpdateAction](/workspace/gmail/markup/reference/types/UpdateAction)

| Name | Type | Description |
| --- | --- | --- |
| replacee | [Thing](/workspace/gmail/markup/reference/types/Thing) | A sub property of object. The object that is being replaced. |
| replacer | [Thing](/workspace/gmail/markup/reference/types/Thing) | A sub property of object. The object that replaces. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/PerformAction

Send feedback

# PerformAction Stay organized with collections Save and categorize content based on your preferences.

Type name: [PerformAction](/workspace/gmail/markup/reference/types/PerformAction)

Extends [PlayAction](/workspace/gmail/markup/reference/types/PlayAction)

| Name | Type | Description |
| --- | --- | --- |
| entertainmentBusiness | [EntertainmentBusiness](/workspace/gmail/markup/reference/types/EntertainmentBusiness) | A sub property of location. The entertainment business where the action occurred. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/Flight

Send feedback

# Flight Stay organized with collections Save and categorize content based on your preferences.

Type name: [Flight](/workspace/gmail/markup/reference/types/Flight)

Extends [Intangible](/workspace/gmail/markup/reference/types/Intangible)

| Name | Type | Description |
| --- | --- | --- |
| aircraft | [Text](/workspace/gmail/markup/reference/types/Text) or [Vehicle](/workspace/gmail/markup/reference/types/Vehicle) | The kind of aircraft (e.g., "Boeing 747"). |
| arrivalAirport | [Airport](/workspace/gmail/markup/reference/types/Airport) | The airport where the flight terminates. |
| arrivalGate | [Text](/workspace/gmail/markup/reference/types/Text) | Identifier of the flight's arrival gate. |
| arrivalTerminal | [Text](/workspace/gmail/markup/reference/types/Text) | Identifier of the flight's arrival terminal. |
| arrivalTime | [DateTime](/workspace/gmail/markup/reference/types/DateTime) | The expected arrival time. |
| carrier | [Organization](/workspace/gmail/markup/reference/types/Organization) | 'carrier' is an out-dated term indicating the 'provider' for parcel delivery and flights. |
| departureAirport | [Airport](/workspace/gmail/markup/reference/types/Airport) | The airport where the flight originates. |
| departureGate | [Text](/workspace/gmail/markup/reference/types/Text) | Identifier of the flight's departure gate. |
| departureTerminal | [Text](/workspace/gmail/markup/reference/types/Text) | Identifier of the flight's departure terminal. |
| departureTime | [DateTime](/workspace/gmail/markup/reference/types/DateTime) | The expected departure time. |
| estimatedFlightDuration | [Duration](/workspace/gmail/markup/reference/types/Duration) or [Text](/workspace/gmail/markup/reference/types/Text) | The estimated time the flight will take. |
| flightDistance | [Distance](/workspace/gmail/markup/reference/types/Distance) or [Text](/workspace/gmail/markup/reference/types/Text) | The distance of the flight. |
| flightNumber | [Text](/workspace/gmail/markup/reference/types/Text) | The unique identifier for a flight including the airline IATA code. For example, if describing United flight 110, where the IATA code for United is 'UA', the flightNumber is 'UA110'. |
| mealService | [Text](/workspace/gmail/markup/reference/types/Text) | Description of the meals that will be provided or available for purchase. |
| provider | [Organization](/workspace/gmail/markup/reference/types/Organization) or [Person](/workspace/gmail/markup/reference/types/Person) | The organization providing the reservation. |
| seller | [Organization](/workspace/gmail/markup/reference/types/Organization) or [Person](/workspace/gmail/markup/reference/types/Person) | An entity which offers (sells / leases / lends / loans) the services / goods. A seller may also be a provider. |
| webCheckinTime | [DateTime](/workspace/gmail/markup/reference/types/DateTime) | The time when a passenger can check into the flight online. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/FurnitureStore

Send feedback

# FurnitureStore Stay organized with collections Save and categorize content based on your preferences.

Type name: [FurnitureStore](/workspace/gmail/markup/reference/types/FurnitureStore)

Extends [Store](/workspace/gmail/markup/reference/types/Store)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/PlayAction

Send feedback

# PlayAction Stay organized with collections Save and categorize content based on your preferences.

Type name: [PlayAction](/workspace/gmail/markup/reference/types/PlayAction)

Extends [Action](/workspace/gmail/markup/reference/types/Action)

| Name | Type | Description |
| --- | --- | --- |
| audience | [Audience](/workspace/gmail/markup/reference/types/Audience) | The intended audience of the item, i.e. the group for whom the item was created. |
| event | [Event](/workspace/gmail/markup/reference/types/Event) | The event information. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/BusReservation

Send feedback

# BusReservation Stay organized with collections Save and categorize content based on your preferences.

Type name: [BusReservation](/workspace/gmail/markup/reference/types/BusReservation)

Extends [Reservation](/workspace/gmail/markup/reference/types/Reservation)

| Name | Type | Description |
| --- | --- | --- |
| **bookingAgent** | [Person](/workspace/gmail/markup/reference/types/Person) or [Organization](/workspace/gmail/markup/reference/types/Organization) | Booking agent or agency. Also accepts a string (e.g. ""). |
| bookingAgent.**name** | [Text](/workspace/gmail/markup/reference/types/Text) | Name of the agent/service. |
| bookingAgent.**url** | [URL](/workspace/gmail/markup/reference/types/URL) | Website of the agent/service. |
| **bookingTime** | [DateTime](/workspace/gmail/markup/reference/types/DateTime) | Date the reservation was made. |
| **cancelReservationUrl** | [URL](/workspace/gmail/markup/reference/types/URL) | Web page where reservation can be cancelled. |
| **checkinUrl** | [URL](/workspace/gmail/markup/reference/types/URL) | Webpage where the passenger can check in. |
| **confirmReservationUrl** | [URL](/workspace/gmail/markup/reference/types/URL) | Web page where reservation can be confirmed. |
| **modifiedTime** | [DateTime](/workspace/gmail/markup/reference/types/DateTime) | (recommended for Confirmation Cards/Search Answers) Time the reservation was last modified. |
| **modifyReservationUrl** | [URL](/workspace/gmail/markup/reference/types/URL) | (recommended for Confirmation Cards/Search Answers) Web page where reservation can be modified. |
| **programMembership** | [ProgramMembership](/workspace/gmail/markup/reference/types/ProgramMembership) | Any membership in a frequent flyer, hotel loyalty program, etc. being applied to the reservation. |
| programMembership.**memberNumber** | [Text](/workspace/gmail/markup/reference/types/Text) | The identifier of the membership. |
| programMembership.**program** | [Text](/workspace/gmail/markup/reference/types/Text) | The name of the program. |
| **reservationFor**  **(Required)** | [BusTrip](/workspace/gmail/markup/reference/types/BusTrip) | Information about the bus trip. |
| reservationFor.**arrivalBusStop**  **(Required)** | [BusStation](/workspace/gmail/markup/reference/types/BusStation) or [BusStop](/workspace/gmail/markup/reference/types/BusStop) | Where the bus arrives at. |
| reservationFor.arrivalBusStop.**address** | [PostalAddress](/workspace/gmail/markup/reference/types/PostalAddress) | Address of the arrival bus stop / station. |
| reservationFor.arrivalBusStop.address.**addressCountry** | [Text](/workspace/gmail/markup/reference/types/Text) or [Country](/workspace/gmail/markup/reference/types/Country) | (recommended for Confirmation Cards/Search Answers) Country of arrival bus stop / station. |
| reservationFor.arrivalBusStop.address.**addressLocality** | [Text](/workspace/gmail/markup/reference/types/Text) | (recommended for Confirmation Cards/Search Answers) Locality (e.g. city) of arrival bus stop / station. |
| reservationFor.arrivalBusStop.address.**addressRegion** | [Text](/workspace/gmail/markup/reference/types/Text) | (recommended for Confirmation Cards/Search Answers) Region (e.g. State) of arrival bus stop / station. |
| reservationFor.arrivalBusStop.address.**postalCode** | [Text](/workspace/gmail/markup/reference/types/Text) | (recommended for Confirmation Cards/Search Answers) Postal code of arrival bus stop / station. |
| reservationFor.arrivalBusStop.address.**streetAddress** | [Text](/workspace/gmail/markup/reference/types/Text) | (recommended for Confirmation Cards/Search Answers) Street address of arrival bus stop / station. |
| reservationFor.arrivalBusStop.**directions** | [Text](/workspace/gmail/markup/reference/types/Text) | Directions to the bus stop. |
| reservationFor.arrivalBusStop.**name**  **(Required)** | [Text](/workspace/gmail/markup/reference/types/Text) | Name of the BusStop. |
| reservationFor.**arrivalTime**  **(Required)** | [DateTime](/workspace/gmail/markup/reference/types/DateTime) | Bus arrival time. |
| reservationFor.**busCompany**  **(Required)** | [Organization](/workspace/gmail/markup/reference/types/Organization) | e.g. Bolt NYC. Also accepts a string (e.g. "Bolt NYC"). |
| reservationFor.busCompany.**name**  **(Required)** | [Text](/workspace/gmail/markup/reference/types/Text) | Name of the Organization. |
| reservationFor.**busName** | [Text](/workspace/gmail/markup/reference/types/Text) | e.g. Bolt Express. |
| reservationFor.**busNumber** | [Text](/workspace/gmail/markup/reference/types/Text) | e.g. 101. |
| reservationFor.**departureBusStop**  **(Required)** | [BusStation](/workspace/gmail/markup/reference/types/BusStation) or [BusStop](/workspace/gmail/markup/reference/types/BusStop) | Where the bus departs from. |
| reservationFor.departureBusStop.**address** | [PostalAddress](/workspace/gmail/markup/reference/types/PostalAddress) | Address of the departure bus stop / station. |
| reservationFor.departureBusStop.address.**addressCountry** | [Text](/workspace/gmail/markup/reference/types/Text) or [Country](/workspace/gmail/markup/reference/types/Country) | (recommended for Confirmation Cards/Search Answers) Country of departure bus stop / station. |
| reservationFor.departureBusStop.address.**addressLocality** | [Text](/workspace/gmail/markup/reference/types/Text) | (recommended for Confirmation Cards/Search Answers) Locality (e.g. city) of departure bus stop / station. |
| reservationFor.departureBusStop.address.**addressRegion** | [Text](/workspace/gmail/markup/reference/types/Text) | (recommended for Confirmation Cards/Search Answers) Region (e.g. State) of departure bus stop / station. |
| reservationFor.departureBusStop.address.**postalCode** | [Text](/workspace/gmail/markup/reference/types/Text) | (recommended for Confirmation Cards/Search Answers) Postal code of departure bus stop / station. |
| reservationFor.departureBusStop.address.**streetAddress** | [Text](/workspace/gmail/markup/reference/types/Text) | (recommended for Confirmation Cards/Search Answers) Street address of departure bus stop / station. |
| reservationFor.departureBusStop.**directions** | [Text](/workspace/gmail/markup/reference/types/Text) | Directions to the bus stop. |
| reservationFor.departureBusStop.**name**  **(Required)** | [Text](/workspace/gmail/markup/reference/types/Text) | Name of the BusStop. |
| reservationFor.**departureTime**  **(Required)** | [DateTime](/workspace/gmail/markup/reference/types/DateTime) | Bus departure time. |
| reservationFor.**name** | [Text](/workspace/gmail/markup/reference/types/Text) | Name of the BusTrip. |
| **reservationNumber**  **(Required)** | [Text](/workspace/gmail/markup/reference/types/Text) | The number or id of the reservation. |
| **reservationStatus**  **(Required)** | [ReservationStatus](/workspace/gmail/markup/reference/types/ReservationStatus) | Current status of the reservation. |
| **reservedTicket** | [Ticket](/workspace/gmail/markup/reference/types/Ticket) | Ticket information. |
| reservedTicket.**additionalTicketText** | [Text](/workspace/gmail/markup/reference/types/Text) | Additional explanatory text about the ticket. |
| reservedTicket.**downloadUrl** | [URL](/workspace/gmail/markup/reference/types/URL) | . |
| reservedTicket.**price** | [Text](/workspace/gmail/markup/reference/types/Text) | Total price of the ticket. |
| reservedTicket.**priceCurrency** | [Text](/workspace/gmail/markup/reference/types/Text) | The currency (in 3-letter ISO 4217 format) of the ticket's price. |
| reservedTicket.**printUrl** | [URL](/workspace/gmail/markup/reference/types/URL) | . |
| reservedTicket.**ticketedSeat** | [Seat](/workspace/gmail/markup/reference/types/Seat) | The location of the reserved seat (e.g., 27B). . |
| reservedTicket.ticketedSeat.**seatingType** | [Text](/workspace/gmail/markup/reference/types/Text) | The type/class of the seat. |
| reservedTicket.ticketedSeat.**seatNumber** | [Text](/workspace/gmail/markup/reference/types/Text) | The location of the reserved seat. |
| reservedTicket.ticketedSeat.**seatRow** | [Text](/workspace/gmail/markup/reference/types/Text) | The row location of the reserved seat. |
| reservedTicket.**ticketNumber** | [Text](/workspace/gmail/markup/reference/types/Text) | The number or id of the ticket. |
| reservedTicket.**ticketToken** | [Text](/workspace/gmail/markup/reference/types/Text) or [URL](/workspace/gmail/markup/reference/types/URL) | If the barcode image is hosted on your site, the value of the field is URL of the image, or a barcode or QR URI, such as "barcode128:AB34" (ISO-15417 barcodes), "qrCode:AB34" (QR codes), "aztecCode:AB34" (Aztec codes), "barcodeEAN:1234" (EAN codes) and "barcodeUPCA:1234" (UPCA codes). |
| reservedTicket.**underName** | [Person](/workspace/gmail/markup/reference/types/Person) or [Organization](/workspace/gmail/markup/reference/types/Organization) | The Person or organization the ticket is for. |
| reservedTicket.underName.**name** | [Text](/workspace/gmail/markup/reference/types/Text) | Name of the Person. |
| **underName**  **(Required)** | [Person](/workspace/gmail/markup/reference/types/Person) or [Organization](/workspace/gmail/markup/reference/types/Organization) | The passenger. |
| underName.**email** | [Text](/workspace/gmail/markup/reference/types/Text) | Email address. |
| underName.**name**  **(Required)** | [Text](/workspace/gmail/markup/reference/types/Text) | Name of the Person. |
| **url** | [URL](/workspace/gmail/markup/reference/types/URL) | Web page where reservation can be viewed. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/MedicalTherapy

Send feedback

# MedicalTherapy Stay organized with collections Save and categorize content based on your preferences.

Type name: [MedicalTherapy](/workspace/gmail/markup/reference/types/MedicalTherapy)

Extends [MedicalEntity](/workspace/gmail/markup/reference/types/MedicalEntity)

| Name | Type | Description |
| --- | --- | --- |
| adverseOutcome | [MedicalEntity](/workspace/gmail/markup/reference/types/MedicalEntity) | A possible complication and/or side effect of this therapy. If it is known that an adverse outcome is serious (resulting in death, disability, or permanent damage; requiring hospitalization; or is otherwise life-threatening or requires immediate medical attention), tag it as a seriouseAdverseOutcome instead. |
| contraindication | [MedicalContraindication](/workspace/gmail/markup/reference/types/MedicalContraindication) | A contraindication for this therapy. |
| duplicateTherapy | [MedicalTherapy](/workspace/gmail/markup/reference/types/MedicalTherapy) | A therapy that duplicates or overlaps this one. |
| indication | [MedicalIndication](/workspace/gmail/markup/reference/types/MedicalIndication) | A factor that indicates use of this therapy for treatment and/or prevention of a condition, symptom, etc. For therapies such as drugs, indications can include both officially-approved indications as well as off-label uses. These can be distinguished by using the ApprovedIndication subtype of MedicalIndication. |
| seriousAdverseOutcome | [MedicalEntity](/workspace/gmail/markup/reference/types/MedicalEntity) | A possible serious complication and/or serious side effect of this therapy. Serious adverse outcomes include those that are life-threatening; result in death, disability, or permanent damage; require hospitalization or prolong existing hospitalization; cause congenital anomalies or birth defects; or jeopardize the patient and may require medical or surgical intervention to prevent one of the outcomes in this definition. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/DrugCost

Send feedback

# DrugCost Stay organized with collections Save and categorize content based on your preferences.

Type name: [DrugCost](/workspace/gmail/markup/reference/types/DrugCost)

Extends [MedicalIntangible](/workspace/gmail/markup/reference/types/MedicalIntangible)

| Name | Type | Description |
| --- | --- | --- |
| applicableLocation | [AdministrativeArea](/workspace/gmail/markup/reference/types/AdministrativeArea) | The location in which the status applies. |
| costCategory | [DrugCostCategory](/workspace/gmail/markup/reference/types/DrugCostCategory) | The category of cost, such as wholesale, retail, reimbursement cap, etc. |
| costCurrency | [Text](/workspace/gmail/markup/reference/types/Text) | The currency (in 3-letter [ISO 4217 format](http://en.wikipedia.org/wiki/ISO_4217)) of the drug cost. |
| costOrigin | [Text](/workspace/gmail/markup/reference/types/Text) | Additional details to capture the origin of the cost data. For example, 'Medicare Part B'. |
| costPerUnit | [Number](/workspace/gmail/markup/reference/types/Number) or [Text](/workspace/gmail/markup/reference/types/Text) | The cost per unit of the drug. |
| drugUnit | [Text](/workspace/gmail/markup/reference/types/Text) | The unit in which the drug is measured, e.g. '5 mg tablet'. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/api/reference/rest/v1/InternalDateSource

Send feedback

# InternalDateSource Stay organized with collections Save and categorize content based on your preferences.

| Enums | |
| --- | --- |
| `receivedTime` | Internal message date set to current time when received by Gmail. |
| `dateHeader` | Internal message time based on 'Date' header in email, when valid. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/Distance

Send feedback

# Distance Stay organized with collections Save and categorize content based on your preferences.

Type name: [Distance](/workspace/gmail/markup/reference/types/Distance)

Extends [Quantity](/workspace/gmail/markup/reference/types/Quantity)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/Action

Send feedback

# Action Stay organized with collections Save and categorize content based on your preferences.

Type name: [Action](/workspace/gmail/markup/reference/types/Action)

Extends [Event](/workspace/gmail/markup/reference/types/Event) or [Thing](/workspace/gmail/markup/reference/types/Thing)

| Name | Type | Description |
| --- | --- | --- |
| actionStatus | [ActionStatusType](/workspace/gmail/markup/reference/types/ActionStatusType) | Indicates the current disposition of the Action. |
| agent | [Organization](/workspace/gmail/markup/reference/types/Organization) or [Person](/workspace/gmail/markup/reference/types/Person) | The direct performer or driver of the action (animate or inanimate). e.g. *John* wrote a book. |
| endTime | [DateTime](/workspace/gmail/markup/reference/types/DateTime) | The endTime of something. For a reserved event or service (e.g. FoodEstablishmentReservation), the time that it is expected to end. For actions that span a period of time, when the action was performed. e.g. John wrote a book from January to *December*. Note that Event uses startDate/endDate instead of startTime/endTime, even when describing dates with times. This situation may be clarified in future revisions. |
| error | [Thing](/workspace/gmail/markup/reference/types/Thing) | For failed actions, more information on the cause of the failure. |
| handler | [HttpActionHandler](/workspace/gmail/markup/reference/types/HttpActionHandler) | Handlers supported by RSVP action. |
| instrument | [Thing](/workspace/gmail/markup/reference/types/Thing) | The object that helped the agent perform the action. e.g. John wrote a book with *a pen*. |
| location | [Place](/workspace/gmail/markup/reference/types/Place) or [PostalAddress](/workspace/gmail/markup/reference/types/PostalAddress) | The location of the event, organization or action. |
| name | [Text](/workspace/gmail/markup/reference/types/Text) | The string shown to the user on the UI element tied to the action. |
| object | [Thing](/workspace/gmail/markup/reference/types/Thing) | The object upon the action is carried out, whose state is kept intact or changed. Also known as the semantic roles patient, affected or undergoer (which change their state) or theme (which doesn't). e.g. John read *a book*. |
| participant | [Organization](/workspace/gmail/markup/reference/types/Organization) or [Person](/workspace/gmail/markup/reference/types/Person) | Other co-agents that participated in the action indirectly. e.g. John wrote a book with *Steve*. |
| result | [Thing](/workspace/gmail/markup/reference/types/Thing) | The result produced in the action. e.g. John wrote *a book*. |
| startTime | [DateTime](/workspace/gmail/markup/reference/types/DateTime) | The startTime of something. For a reserved event or service (e.g. FoodEstablishmentReservation), the time that it is expected to start. For actions that span a period of time, when the action was performed. e.g. John wrote a book from *January* to December. Note that Event uses startDate/endDate instead of startTime/endTime, even when describing dates with times. This situation may be clarified in future revisions. |
| target | [EntryPoint](/workspace/gmail/markup/reference/types/EntryPoint) | Indicates a target EntryPoint for an Action. |
| url | [URL](/workspace/gmail/markup/reference/types/URL) | Target url to fetch in order to complete the action. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/postmaster/reference/rest/v1/domains.trafficStats

Send feedback

# REST Resource: domains.trafficStats Stay organized with collections Save and categorize content based on your preferences.

* [Resource: TrafficStats](#TrafficStats)
  + [JSON representation](#TrafficStats.SCHEMA_REPRESENTATION)
* [IpReputation](#IpReputation)
  + [JSON representation](#IpReputation.SCHEMA_REPRESENTATION)
* [ReputationCategory](#ReputationCategory)
* [FeedbackLoop](#FeedbackLoop)
  + [JSON representation](#FeedbackLoop.SCHEMA_REPRESENTATION)
* [DeliveryError](#DeliveryError)
  + [JSON representation](#DeliveryError.SCHEMA_REPRESENTATION)
* [DeliveryErrorClass](#DeliveryErrorClass)
* [DeliveryErrorType](#DeliveryErrorType)
* [Methods](#METHODS_SUMMARY)

## Resource: TrafficStats

Email traffic statistics pertaining to a specific date.

| JSON representation |
| --- |
| ``` {   "name": string,   "userReportedSpamRatio": number,   "ipReputations": [     {       object (IpReputation)     }   ],   "domainReputation": enum (ReputationCategory),   "spammyFeedbackLoops": [     {       object (FeedbackLoop)     }   ],   "spfSuccessRatio": number,   "dkimSuccessRatio": number,   "dmarcSuccessRatio": number,   "outboundEncryptionRatio": number,   "inboundEncryptionRatio": number,   "deliveryErrors": [     {       object (DeliveryError)     }   ],   "userReportedSpamRatioLowerBound": number,   "userReportedSpamRatioUpperBound": number } ``` |

| Fields | |
| --- | --- |
| `name` | `string`  The resource name of the traffic statistics. Traffic statistic names have the form `domains/{domain}/trafficStats/{date}`, where domain\_name is the fully qualified domain name (i.e., mymail.mydomain.com) of the domain this traffic statistics pertains to and date is the date in yyyymmdd format that these statistics corresponds to. For example: domains/mymail.mydomain.com/trafficStats/20160807 |
| `userReportedSpamRatio` | `number`  The ratio of user-report spam vs. email that was sent to the inbox. This is potentially inexact -- users may want to refer to the description of the interval fields `userReportedSpamRatioLowerBound` and `userReportedSpamRatioUpperBound` for more explicit accuracy guarantees. This metric only pertains to emails authenticated by [DKIM](http://www.dkim.org/). |
| `ipReputations[]` | `object (IpReputation)`  Reputation information pertaining to the IP addresses of the email servers for the domain. There is exactly one entry for each reputation category except `REPUTATION_CATEGORY_UNSPECIFIED`. |
| `domainReputation` | `enum (ReputationCategory)`  Reputation of the domain. |
| `spammyFeedbackLoops[]` | `object (FeedbackLoop)`  Spammy [Feedback loop identifiers](https://support.google.com/mail/answer/6254652) with their individual spam rates. This metric only pertains to traffic that is authenticated by [DKIM](http://www.dkim.org/). |
| `spfSuccessRatio` | `number`  The ratio of mail that successfully authenticated with SPF vs. all mail that attempted to authenticate with [SPF](http://www.openspf.org/). Spoofed mail is excluded. |
| `dkimSuccessRatio` | `number`  The ratio of mail that successfully authenticated with DKIM vs. all mail that attempted to authenticate with [DKIM](http://www.dkim.org/). Spoofed mail is excluded. |
| `dmarcSuccessRatio` | `number`  The ratio of mail that passed [DMARC](https://dmarc.org/) alignment checks vs all mail received from the domain that successfully authenticated with either of [SPF](http://www.openspf.org/) or [DKIM](http://www.dkim.org/). |
| `outboundEncryptionRatio` | `number`  The ratio of outgoing mail (from Gmail) that was accepted over secure transport (TLS). |
| `inboundEncryptionRatio` | `number`  The ratio of incoming mail (to Gmail), that passed secure transport (TLS) vs all mail received from that domain. This metric only pertains to traffic that passed [SPF](http://www.openspf.org/) or [DKIM](http://www.dkim.org/). |
| `deliveryErrors[]` | `object (DeliveryError)`  Delivery errors for the domain. This metric only pertains to traffic that passed [SPF](http://www.openspf.org/) or [DKIM](http://www.dkim.org/). |
| `userReportedSpamRatioLowerBound` | `number`  The lower bound of the confidence interval for the user reported spam ratio. If this field is set, then the value of `userReportedSpamRatio` is set to the midpoint of this interval and is thus inexact. However, the true ratio is guaranteed to be in between this lower bound and the corresponding upper bound 95% of the time. This metric only pertains to emails authenticated by [DKIM](http://www.dkim.org/). |
| `userReportedSpamRatioUpperBound` | `number`  The upper bound of the confidence interval for the user reported spam ratio. If this field is set, then the value of `userReportedSpamRatio` is set to the midpoint of this interval and is thus inexact. However, the true ratio is guaranteed to be in between this upper bound and the corresponding lower bound 95% of the time. This metric only pertains to emails authenticated by [DKIM](http://www.dkim.org/). |

## IpReputation

IP Reputation information for a set of IPs in a specific reputation category.

| JSON representation |
| --- |
| ``` {   "reputation": enum (ReputationCategory),   "ipCount": string,   "sampleIps": [     string   ] } ``` |

| Fields | |
| --- | --- |
| `reputation` | `enum (ReputationCategory)`  The reputation category this IP reputation represents. |
| `ipCount` | `string (int64 format)`  Total number of unique IPs in this reputation category. This metric only pertains to traffic that passed [SPF](http://www.openspf.org/) or [DKIM](http://www.dkim.org/). |
| `sampleIps[]` | `string`  A sample of IPs in this reputation category. |

## ReputationCategory

The reputation of a domain or IP. For more information see "Domain & IP Reputation Dashboards" in the Dashboards section on the [Postmaster Tools help page page](https://support.google.com/mail/answer/6227174).

| Enums | |
| --- | --- |
| `REPUTATION_CATEGORY_UNSPECIFIED` | The default value which should never be used explicitly. This represents the state where no reputation information is available. |
| `HIGH` | Has a good track record of a very low spam rate, and complies with Gmail's sender guidelines. Mail will rarely be marked by the spam filter. |
| `MEDIUM` | Known to send good mail, but is prone to sending a low volume of spam intermittently. Most of the email from this entity will have a fair deliverability rate, except when there is a notable increase in spam levels. |
| `LOW` | Known to send a considerable volume of spam regularly, and mail from this sender will likely be marked as spam. |
| `BAD` | History of sending an enormously high volume of spam. Mail coming from this entity will almost always be rejected at SMTP level or marked as spam. |

## FeedbackLoop

[Feedback loop](https://support.google.com/mail/answer/6254652) identifier information.

| JSON representation |
| --- |
| ``` {   "id": string,   "spamRatio": number } ``` |

| Fields | |
| --- | --- |
| `id` | `string`  Feedback loop identifier that uniquely identifies individual campaigns. |
| `spamRatio` | `number`  The ratio of user marked spam messages with the identifier vs the total number of inboxed messages with that identifier. |

## DeliveryError

Metric on a particular delivery error type.

| JSON representation |
| --- |
| ``` {   "errorClass": enum (DeliveryErrorClass),   "errorType": enum (DeliveryErrorType),   "errorRatio": number } ``` |

| Fields | |
| --- | --- |
| `errorClass` | `enum (DeliveryErrorClass)`  The class of delivery error. |
| `errorType` | `enum (DeliveryErrorType)`  The type of delivery error. |
| `errorRatio` | `number`  The ratio of messages where the error occurred vs all authenticated traffic. |

## DeliveryErrorClass

The class of delivery error.

| Enums | |
| --- | --- |
| `DELIVERY_ERROR_CLASS_UNSPECIFIED` | The default value which should never be used explicitly. |
| `PERMANENT_ERROR` | Delivery of message has been rejected. |
| `TEMPORARY_ERROR` | Temporary failure of message delivery to the recipient. |

## DeliveryErrorType

The type of delivery error.

| Enums | |
| --- | --- |
| `DELIVERY_ERROR_TYPE_UNSPECIFIED` | The default value which should never be used explicitly. |
| `RATE_LIMIT_EXCEEDED` | The Domain or IP is sending traffic at a suspiciously high rate, due to which temporary rate limits have been imposed. The limit will be lifted when Gmail is confident enough of the nature of the traffic. |
| `SUSPECTED_SPAM` | The traffic is suspected to be spam, by Gmail, for various reasons. |
| `CONTENT_SPAMMY` | The traffic is suspected to be spammy, specific to the content. |
| `BAD_ATTACHMENT` | Traffic contains attachments not supported by Gmail. |
| `BAD_DMARC_POLICY` | The sender domain has set up a DMARC rejection policy. |
| `LOW_IP_REPUTATION` | The IP reputation of the sending IP is very low. |
| `LOW_DOMAIN_REPUTATION` | The Domain reputation of the sending domain is very low. |
| `IP_IN_RBL` | The IP is listed in one or more public [Real-time Blackhole Lists](http://en.wikipedia.org/wiki/DNSBL). Work with the RBL to get your IP delisted. |
| `DOMAIN_IN_RBL` | The Domain is listed in one or more public [Real-time Blackhole Lists](http://en.wikipedia.org/wiki/DNSBL). Work with the RBL to get your domain delisted. |
| `BAD_PTR_RECORD` | The sending IP is missing a [PTR record](https://support.google.com/domains/answer/3251147#ptr). |

| Methods | |
| --- | --- |
| `get` | Get traffic statistics for a domain on a specific date. |
| `list` | List traffic statistics for all available days. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/PriceSpecification

Send feedback

# PriceSpecification Stay organized with collections Save and categorize content based on your preferences.

Type name: [PriceSpecification](/workspace/gmail/markup/reference/types/PriceSpecification)

Extends [StructuredValue](/workspace/gmail/markup/reference/types/StructuredValue)

| Name | Type | Description |
| --- | --- | --- |
| eligibleQuantity | [QuantitativeValue](/workspace/gmail/markup/reference/types/QuantitativeValue) | The interval and unit of measurement of ordering quantities for which the offer or price specification is valid. This allows e.g. specifying that a certain freight charge is valid only for a certain quantity. |
| eligibleTransactionVolume | [PriceSpecification](/workspace/gmail/markup/reference/types/PriceSpecification) | The transaction volume, in a monetary unit, for which the offer or price specification is valid, e.g. for indicating a minimal purchasing volume, to express free shipping above a certain order volume, or to limit the acceptance of credit cards to purchases to a certain minimal amount. |
| maxPrice | [Number](/workspace/gmail/markup/reference/types/Number) | The highest price if the price is a range. |
| minPrice | [Number](/workspace/gmail/markup/reference/types/Number) | The lowest price if the price is a range. |
| price | [Number](/workspace/gmail/markup/reference/types/Number) or [Text](/workspace/gmail/markup/reference/types/Text) | Total price of the Reservation. |
| priceCurrency | [Text](/workspace/gmail/markup/reference/types/Text) | The currency (in 3-letter ISO 4217 format) of the Reservation's price. |
| validFrom | [DateTime](/workspace/gmail/markup/reference/types/DateTime) | The date when the item becomes valid. |
| validThrough | [DateTime](/workspace/gmail/markup/reference/types/DateTime) | The end of the validity of offer, price specification, or opening hours data. |
| valueAddedTaxIncluded | [Boolean](/workspace/gmail/markup/reference/types/Boolean) | Specifies whether the applicable value-added tax (VAT) is included in the price specification or not. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.settings/updateAutoForwarding

Send feedback

# Method: users.settings.updateAutoForwarding Stay organized with collections Save and categorize content based on your preferences.

* [HTTP request](#body.HTTP_TEMPLATE)
* [Path parameters](#body.PATH_PARAMETERS)
* [Request body](#body.request_body)
* [Response body](#body.response_body)
* [Authorization scopes](#body.aspect)
* [Try it!](#try-it)

Updates the auto-forwarding setting for the specified account. A verified forwarding address must be specified when auto-forwarding is enabled.

This method is only available to service account clients that have been delegated domain-wide authority.

### HTTP request

`PUT https://gmail.googleapis.com/gmail/v1/users/{userId}/settings/autoForwarding`

The URL uses [gRPC Transcoding](https://google.aip.dev/127) syntax.

### Path parameters

| Parameters | |
| --- | --- |
| `userId` | `string`  User's email address. The special value "me" can be used to indicate the authenticated user. |

### Request body

The request body contains an instance of `AutoForwarding`.

### Response body

If successful, the response body contains an instance of `AutoForwarding`.

### Authorization scopes

Requires the following OAuth scope:

* `https://www.googleapis.com/auth/gmail.settings.sharing`

For more information, see the [OAuth 2.0 Overview](/identity/protocols/OAuth2).




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/MusicVenue

Send feedback

# MusicVenue Stay organized with collections Save and categorize content based on your preferences.

Type name: [MusicVenue](/workspace/gmail/markup/reference/types/MusicVenue)

Extends [CivicStructure](/workspace/gmail/markup/reference/types/CivicStructure)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/Code

Send feedback

# Code Stay organized with collections Save and categorize content based on your preferences.

Type name: [Code](/workspace/gmail/markup/reference/types/Code)

Extends [CreativeWork](/workspace/gmail/markup/reference/types/CreativeWork)

| Name | Type | Description |
| --- | --- | --- |
| codeRepository | [URL](/workspace/gmail/markup/reference/types/URL) | Link to the repository where the un-compiled, human readable code and related code is located (SVN, github, CodePlex). |
| programmingLanguage | [Thing](/workspace/gmail/markup/reference/types/Thing) | The computer programming language. |
| runtime | [Text](/workspace/gmail/markup/reference/types/Text) | Runtime platform or script interpreter dependencies (Example - Java v1, Python2.3, .Net Framework 3.0). |
| sampleType | [Text](/workspace/gmail/markup/reference/types/Text) | Full (compile ready) solution, code snippet, inline code, scripts, template. |
| targetProduct | [SoftwareApplication](/workspace/gmail/markup/reference/types/SoftwareApplication) | Target Operating System / Product to which the code applies. If applies to several versions, just the product name can be used. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/android/com/google/android/gm/contentprovider/GmailContract.Labels.LabelCanonicalNames.html

Send feedback

# GmailContract.Labels.LabelCanonicalNames Stay organized with collections Save and categorize content based on your preferences.

public static final class
**GmailContract.Labels.LabelCanonicalNames**

Label canonical names for default Gmail system labels.

| Constants | | |
| --- | --- | --- |
| [CANONICAL\_NAME\_ALL\_MAIL](https://developers.google.com/workspace/gmail/android/com/google/android/gm/contentprovider/GmailContract.Labels.LabelCanonicalNames.html#CANONICAL_NAME_ALL_MAIL) |
| [CANONICAL\_NAME\_DRAFTS](https://developers.google.com/workspace/gmail/android/com/google/android/gm/contentprovider/GmailContract.Labels.LabelCanonicalNames.html#CANONICAL_NAME_DRAFTS) |
| [CANONICAL\_NAME\_INBOX](https://developers.google.com/workspace/gmail/android/com/google/android/gm/contentprovider/GmailContract.Labels.LabelCanonicalNames.html#CANONICAL_NAME_INBOX) |
| [CANONICAL\_NAME\_INBOX\_CATEGORY\_FORUMS](https://developers.google.com/workspace/gmail/android/com/google/android/gm/contentprovider/GmailContract.Labels.LabelCanonicalNames.html#CANONICAL_NAME_INBOX_CATEGORY_FORUMS) |
| [CANONICAL\_NAME\_INBOX\_CATEGORY\_PRIMARY](https://developers.google.com/workspace/gmail/android/com/google/android/gm/contentprovider/GmailContract.Labels.LabelCanonicalNames.html#CANONICAL_NAME_INBOX_CATEGORY_PRIMARY) |
| [CANONICAL\_NAME\_INBOX\_CATEGORY\_PROMOTIONS](https://developers.google.com/workspace/gmail/android/com/google/android/gm/contentprovider/GmailContract.Labels.LabelCanonicalNames.html#CANONICAL_NAME_INBOX_CATEGORY_PROMOTIONS) |
| [CANONICAL\_NAME\_INBOX\_CATEGORY\_SOCIAL](https://developers.google.com/workspace/gmail/android/com/google/android/gm/contentprovider/GmailContract.Labels.LabelCanonicalNames.html#CANONICAL_NAME_INBOX_CATEGORY_SOCIAL) |
| [CANONICAL\_NAME\_INBOX\_CATEGORY\_UPDATES](https://developers.google.com/workspace/gmail/android/com/google/android/gm/contentprovider/GmailContract.Labels.LabelCanonicalNames.html#CANONICAL_NAME_INBOX_CATEGORY_UPDATES) |
| [CANONICAL\_NAME\_PRIORITY\_INBOX](https://developers.google.com/workspace/gmail/android/com/google/android/gm/contentprovider/GmailContract.Labels.LabelCanonicalNames.html#CANONICAL_NAME_PRIORITY_INBOX) |
| [CANONICAL\_NAME\_SENT](https://developers.google.com/workspace/gmail/android/com/google/android/gm/contentprovider/GmailContract.Labels.LabelCanonicalNames.html#CANONICAL_NAME_SENT) |
| [CANONICAL\_NAME\_SPAM](https://developers.google.com/workspace/gmail/android/com/google/android/gm/contentprovider/GmailContract.Labels.LabelCanonicalNames.html#CANONICAL_NAME_SPAM) |
| [CANONICAL\_NAME\_STARRED](https://developers.google.com/workspace/gmail/android/com/google/android/gm/contentprovider/GmailContract.Labels.LabelCanonicalNames.html#CANONICAL_NAME_STARRED) |
| [CANONICAL\_NAME\_TRASH](https://developers.google.com/workspace/gmail/android/com/google/android/gm/contentprovider/GmailContract.Labels.LabelCanonicalNames.html#CANONICAL_NAME_TRASH) |







## Constants

#### public static final String **CANONICAL\_NAME\_ALL\_MAIL**

Canonical name for the All Mail label

Constant Value: 

"^all"

#### public static final String **CANONICAL\_NAME\_DRAFTS**

Canonical name for the Drafts label

Constant Value: 

"^r"

#### public static final String **CANONICAL\_NAME\_INBOX**

Canonical name for the Inbox label

*Note: This label may not exist, based on the user's inbox configuration*

Constant Value: 

"^i"

#### public static final String **CANONICAL\_NAME\_INBOX\_CATEGORY\_FORUMS**

Canonical name for the Forums inbox category

*Note: This label may not exist, based on the user's inbox configuration*

Constant Value: 

"^sq\_ig\_i\_group"

#### public static final String **CANONICAL\_NAME\_INBOX\_CATEGORY\_PRIMARY**

Canonical name for the Primary inbox category

*Note: This label may not exist, based on the user's inbox configuration*

Constant Value: 

"^sq\_ig\_i\_personal"

#### public static final String **CANONICAL\_NAME\_INBOX\_CATEGORY\_PROMOTIONS**

Canonical name for the Promotions inbox category

*Note: This label may not exist, based on the user's inbox configuration*

Constant Value: 

"^sq\_ig\_i\_promo"

#### public static final String **CANONICAL\_NAME\_INBOX\_CATEGORY\_SOCIAL**

Canonical name for the Social inbox category

*Note: This label may not exist, based on the user's inbox configuration*

Constant Value: 

"^sq\_ig\_i\_social"

#### public static final String **CANONICAL\_NAME\_INBOX\_CATEGORY\_UPDATES**

Canonical name for the Updates inbox category

*Note: This label may not exist, based on the user's inbox configuration*

Constant Value: 

"^sq\_ig\_i\_notification"

#### public static final String **CANONICAL\_NAME\_PRIORITY\_INBOX**

Canonical name for the Priority Inbox label

*Note: This label may not exist, based on the user's inbox configuration*

Constant Value: 

"^iim"

#### public static final String **CANONICAL\_NAME\_SENT**

Canonical name for the Sent label

Constant Value: 

"^f"

#### public static final String **CANONICAL\_NAME\_SPAM**

Canonical name for the Spam label

Constant Value: 

"^s"

#### public static final String **CANONICAL\_NAME\_STARRED**

Canonical name for the Starred label

Constant Value: 

"^t"

#### public static final String **CANONICAL\_NAME\_TRASH**

Canonical name for the Trash label

Constant Value: 

"^k"




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/ReservationPackage

Send feedback

# ReservationPackage Stay organized with collections Save and categorize content based on your preferences.

Type name: [ReservationPackage](/workspace/gmail/markup/reference/types/ReservationPackage)

Extends [Reservation](/workspace/gmail/markup/reference/types/Reservation) or [Reservation](/workspace/gmail/markup/reference/types/Reservation)

| Name | Type | Description |
| --- | --- | --- |
| reservation | [Reservation](/workspace/gmail/markup/reference/types/Reservation) | The individual reservations included in the package. |
| subReservation | [Reservation](/workspace/gmail/markup/reference/types/Reservation) | The individual reservations included in the package. Typically a repeated property. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/AchieveAction

Send feedback

# AchieveAction Stay organized with collections Save and categorize content based on your preferences.

Type name: [AchieveAction](/workspace/gmail/markup/reference/types/AchieveAction)

Extends [Action](/workspace/gmail/markup/reference/types/Action)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/postmaster/reference/rest/v2beta/domainStats/batchQuery

Send feedback

# Method: domainStats.batchQuery Stay organized with collections Save and categorize content based on your preferences.

* [HTTP request](#body.HTTP_TEMPLATE)
* [Request body](#body.request_body)
  + [JSON representation](#body.request_body.SCHEMA_REPRESENTATION)
* [Response body](#body.response_body)
  + [JSON representation](#body.BatchQueryDomainStatsResponse.SCHEMA_REPRESENTATION)
* [Authorization scopes](#body.aspect)
* [QueryDomainStatsRequest](#QueryDomainStatsRequest)
  + [JSON representation](#QueryDomainStatsRequest.SCHEMA_REPRESENTATION)
* [BatchQueryDomainStatsResult](#BatchQueryDomainStatsResult)
  + [JSON representation](#BatchQueryDomainStatsResult.SCHEMA_REPRESENTATION)
* [Status](#Status)
  + [JSON representation](#Status.SCHEMA_REPRESENTATION)

**Developer Preview:** Available as part of the [Google Workspace Developer Preview Program](https://developers.google.com/workspace/preview), which grants early access to certain features. Executes a batch of QueryDomainStats requests for multiple domains. Returns PERMISSION\_DENIED if you don't have permission to access DomainStats for any of the requested domains.

### HTTP request

`POST https://gmailpostmastertools.googleapis.com/v2beta/domainStats:batchQuery`

The URL uses [gRPC Transcoding](https://google.aip.dev/127) syntax.

### Request body

The request body contains data with the following structure:

| JSON representation |
| --- |
| ``` {   "requests": [     {       object (QueryDomainStatsRequest)     }   ] } ``` |

| Fields | |
| --- | --- |
| `requests[]` | `object (QueryDomainStatsRequest)`  Required. A list of individual query requests. Each request can be for a different domain. A maximum of 100 requests can be included in a single batch. |

### Response body

Response message for domainStats.batchQuery.

**Developer Preview:** Available as part of the [Google Workspace Developer Preview Program](https://developers.google.com/workspace/preview), which grants early access to certain features.

If successful, the response body contains data with the following structure:

| JSON representation |
| --- |
| ``` {   "results": [     {       object (BatchQueryDomainStatsResult)     }   ] } ``` |

| Fields | |
| --- | --- |
| `results[]` | `object (BatchQueryDomainStatsResult)`  A list of responses, one for each query in the BatchQueryDomainStatsRequest. The order of responses will correspond to the order of requests. |

### Authorization scopes

Requires one of the following OAuth scopes:

* `https://www.googleapis.com/auth/postmaster`
* `https://www.googleapis.com/auth/postmaster.traffic.readonly`

For more information, see the [Authorization guide](https://developers.google.com/workspace/guides/configure-oauth-consent).

## QueryDomainStatsRequest

Request message for QueryDomainStats.

**Developer Preview:** Available as part of the [Google Workspace Developer Preview Program](https://developers.google.com/workspace/preview), which grants early access to certain features.

| JSON representation |
| --- |
| ``` {   "parent": string,   "metricDefinitions": [     {       object (MetricDefinition)     }   ],   "timeQuery": {     object (TimeQuery)   },   "pageSize": integer,   "pageToken": string,   "aggregationGranularity": enum (AggregationGranularity) } ``` |

| Fields | |
| --- | --- |
| `parent` | `string`  Required. The parent resource name where the stats are queried. Format: domains/{domain} |
| `metricDefinitions[]` | `object (MetricDefinition)`  Required. The specific metrics to query. You can define a custom name for each metric, which will be used in the response. |
| `timeQuery` | `object (TimeQuery)`  Required. The time range or specific dates for which to retrieve the metrics. |
| `pageSize` | `integer`  Optional. The maximum number of DomainStats resources to return in the response. The server may return fewer than this value. If unspecified, a default value of 10 will be used. The maximum value is 200. |
| `pageToken` | `string`  Optional. The nextPageToken value returned from a previous List request, if any. If the aggregation granularity is DAILY, the page token will be the encoded date + "/" + metric name. If the aggregation granularity is OVERALL, the page token will be the encoded metric name. |
| `aggregationGranularity` | `enum (AggregationGranularity)`  Optional. The granularity at which to aggregate the statistics. If unspecified, defaults to DAILY. |

## BatchQueryDomainStatsResult

Represents the result of a single QueryDomainStatsRequest within a batch.

| JSON representation |
| --- |
| ``` {    // Union field result can be only one of the following:   "response": {     object (QueryDomainStatsResponse)   },   "error": {     object (Status)   }   // End of list of possible types for union field result. } ``` |

| Fields | |
| --- | --- |
| Union field `result`. The result of the individual query. `result` can be only one of the following: | |
| `response` | `object (QueryDomainStatsResponse)`  The successful response for the individual query. |
| `error` | `object (Status)`  The error status if the individual query failed. |

## Status

The `Status` type defines a logical error model that is suitable for different programming environments, including REST APIs and RPC APIs. It is used by [gRPC](https://github.com/grpc). Each `Status` message contains three pieces of data: error code, error message, and error details.

You can find out more about this error model and how to work with it in the [API Design Guide](https://cloud.google.com/apis/design/errors).

| JSON representation |
| --- |
| ``` {   "code": integer,   "message": string,   "details": [     {       "@type": string,       field1: ...,       ...     }   ] } ``` |

| Fields | |
| --- | --- |
| `code` | `integer`  The status code, which should be an enum value of `google.rpc.Code`. |
| `message` | `string`  A developer-facing error message, which should be in English. Any user-facing error message should be localized and sent in the `google.rpc.Status.details` field, or localized by the client. |
| `details[]` | `object`  A list of messages that carry the error details. There is a common set of message types for APIs to use. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/TaxiReservation

Send feedback

# TaxiReservation Stay organized with collections Save and categorize content based on your preferences.

Type name: [TaxiReservation](/workspace/gmail/markup/reference/types/TaxiReservation)

Extends [Reservation](/workspace/gmail/markup/reference/types/Reservation)

| Name | Type | Description |
| --- | --- | --- |
| partySize | [Number](/workspace/gmail/markup/reference/types/Number) or [QuantitativeValue](/workspace/gmail/markup/reference/types/QuantitativeValue) | Number of people the reservation should accommodate. |
| pickupLocation | [Place](/workspace/gmail/markup/reference/types/Place) | Where a taxi will pick up a passenger or a rental car can be picked up. |
| pickupTime | [DateTime](/workspace/gmail/markup/reference/types/DateTime) | When a taxi will pickup a passenger or a rental car can be picked up. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/android/com/google/android/gm/contentprovider/GmailContract

Send feedback

# GmailContract Stay organized with collections Save and categorize content based on your preferences.

public final class
**GmailContract**

Contract for use with the Gmail content provider.

Developers can use this content provider to display label information to the user.
  
The label information includes:

* Label name
* Total number of conversations
* Number of unread conversations
* Label text color
* Label background color

This content provider is available in Gmail version 2.3.6 or newer for Froyo/Gingerbread
and version 4.0.5 and newer for Honeycomb and Ice Cream Sandwich

An application can query the
[Content Resolver](http://developer.android.com/reference/android/content/ContentResolver.html) directly
(or use a [Loader](http://developer.android.com/guide/topics/fundamentals/loaders.html))
to obtain a Cursor with information for all labels on an account

`Cursor labelsCursor = getContentResolver().query(GmailContract.Labels.getLabelsUri(
selectedAccount), null, null, null, null);`

| Nested Classes | | |
| --- | --- | --- |
| [GmailContract.Labels](https://developers.google.com/workspace/gmail/android/com/google/android/gm/contentprovider/GmailContract.Labels.html) | |

| Constants | | |
| --- | --- | --- |
| [AUTHORITY](https://developers.google.com/workspace/gmail/android/com/google/android/gm/contentprovider/GmailContract.html#AUTHORITY) |
| [PERMISSION](https://developers.google.com/workspace/gmail/android/com/google/android/gm/contentprovider/GmailContract.html#PERMISSION) |

| Public Methods | | |
| --- | --- | --- |
| [canReadLabels](https://developers.google.com/workspace/gmail/android/com/google/android/gm/contentprovider/GmailContract.html#canReadLabels(Context))(Context *c*) |







## Constants

#### public static final String **AUTHORITY**

Authority for the Gmail content provider.

Constant Value: 

"com.google.android.gm"

#### public static final String **PERMISSION**

Permission required to access this android.content.ContentProvider

Constant Value: 

"com.google.android.gm.permission.READ\_CONTENT\_PROVIDER"







## Public Methods

#### public static boolean **canReadLabels** (Context *c*)

Check if the installed Gmail app supports querying for label information.

##### Parameters

|  |  |
| --- | --- |
| c | an application Context |

##### Returns

* true if it's safe to make label API queries




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/ElementarySchool

Send feedback

# ElementarySchool Stay organized with collections Save and categorize content based on your preferences.

Type name: [ElementarySchool](/workspace/gmail/markup/reference/types/ElementarySchool)

Extends [EducationalOrganization](/workspace/gmail/markup/reference/types/EducationalOrganization)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/import

Send feedback

# Method: users.messages.import Stay organized with collections Save and categorize content based on your preferences.

* [HTTP request](#body.HTTP_TEMPLATE)
* [Path parameters](#body.PATH_PARAMETERS)
* [Query parameters](#body.QUERY_PARAMETERS)
* [Request body](#body.request_body)
* [Response body](#body.response_body)
* [Authorization scopes](#body.aspect)
* [Try it!](#try-it)

Imports a message into only this user's mailbox, with standard email delivery scanning and classification similar to receiving via SMTP. This method doesn't perform SPF checks, so it might not work for some spam messages, such as those attempting to perform domain spoofing. This method does not send a message. Note that the maximum size of the message is 150MB.

### HTTP request

* Upload URI, for media upload requests:  
  `POST https://gmail.googleapis.com/upload/gmail/v1/users/{userId}/messages/import`
* Metadata URI, for metadata-only requests:  
  `POST https://gmail.googleapis.com/gmail/v1/users/{userId}/messages/import`

The URL uses [gRPC Transcoding](https://google.aip.dev/127) syntax.

### Path parameters

| Parameters | |
| --- | --- |
| `userId` | `string`  The user's email address. The special value `me` can be used to indicate the authenticated user. |

### Query parameters

| Parameters | |
| --- | --- |
| `internalDateSource` | `enum (InternalDateSource)`  Source for Gmail's internal date of the message. |
| `neverMarkSpam` | `boolean`  Ignore the Gmail spam classifier decision and never mark this email as SPAM in the mailbox. |
| `processForCalendar` | `boolean`  Process calendar invites in the email and add any extracted meetings to the Google Calendar for this user. |
| `deleted` | `boolean`  Mark the email as permanently deleted (not TRASH) and only visible in [Google Vault](http://support.google.com/vault/) to a Vault administrator. Only used for Google Workspace accounts. |

### Request body

The request body contains an instance of `Message`.

### Response body

If successful, the response body contains an instance of `Message`.

### Authorization scopes

Requires one of the following OAuth scopes:

* `https://mail.google.com/`
* `https://www.googleapis.com/auth/gmail.modify`
* `https://www.googleapis.com/auth/gmail.insert`

For more information, see the [OAuth 2.0 Overview](/identity/protocols/OAuth2).




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/FireStation

Send feedback

# FireStation Stay organized with collections Save and categorize content based on your preferences.

Type name: [FireStation](/workspace/gmail/markup/reference/types/FireStation)

Extends [CivicStructure](/workspace/gmail/markup/reference/types/CivicStructure) or [EmergencyService](/workspace/gmail/markup/reference/types/EmergencyService)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/AssessAction

Send feedback

# AssessAction Stay organized with collections Save and categorize content based on your preferences.

Type name: [AssessAction](/workspace/gmail/markup/reference/types/AssessAction)

Extends [Action](/workspace/gmail/markup/reference/types/Action)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.settings.sendAs.smimeInfo/list

Send feedback

# Method: users.settings.sendAs.smimeInfo.list Stay organized with collections Save and categorize content based on your preferences.

* [HTTP request](#body.HTTP_TEMPLATE)
* [Path parameters](#body.PATH_PARAMETERS)
* [Request body](#body.request_body)
* [Response body](#body.response_body)
  + [JSON representation](#body.ListSmimeInfoResponse.SCHEMA_REPRESENTATION)
* [Authorization scopes](#body.aspect)
* [Try it!](#try-it)

Lists S/MIME configs for the specified send-as alias.

### HTTP request

`GET https://gmail.googleapis.com/gmail/v1/users/{userId}/settings/sendAs/{sendAsEmail}/smimeInfo`

The URL uses [gRPC Transcoding](https://google.aip.dev/127) syntax.

### Path parameters

| Parameters | |
| --- | --- |
| `userId` | `string`  The user's email address. The special value `me` can be used to indicate the authenticated user. |
| `sendAsEmail` | `string`  The email address that appears in the "From:" header for mail sent using this alias. |

### Request body

The request body must be empty.

### Response body

If successful, the response body contains data with the following structure:

| JSON representation |
| --- |
| ``` {   "smimeInfo": [     {       object (SmimeInfo)     }   ] } ``` |

| Fields | |
| --- | --- |
| `smimeInfo[]` | `object (SmimeInfo)`  List of SmimeInfo. |

### Authorization scopes

Requires one of the following OAuth scopes:

* `https://www.googleapis.com/auth/gmail.settings.basic`
* `https://mail.google.com/`
* `https://www.googleapis.com/auth/gmail.modify`
* `https://www.googleapis.com/auth/gmail.readonly`
* `https://www.googleapis.com/auth/gmail.settings.sharing`

For more information, see the [OAuth 2.0 Overview](/identity/protocols/OAuth2).




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/Periodical

Send feedback

# Periodical Stay organized with collections Save and categorize content based on your preferences.

Type name: [Periodical](/workspace/gmail/markup/reference/types/Periodical)

Extends [Series](/workspace/gmail/markup/reference/types/Series)

| Name | Type | Description |
| --- | --- | --- |
| issn | [Text](/workspace/gmail/markup/reference/types/Text) | The International Standard Serial Number (ISSN) that identifies this periodical. You can repeat this property to (for example) identify different formats of this periodical. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/Map

Send feedback

# Map Stay organized with collections Save and categorize content based on your preferences.

Type name: [Map](/workspace/gmail/markup/reference/types/Map)

Extends [CreativeWork](/workspace/gmail/markup/reference/types/CreativeWork)

| Name | Type | Description |
| --- | --- | --- |
| mapType | [MapCategoryType](/workspace/gmail/markup/reference/types/MapCategoryType) | Indicates the kind of Map, from the MapCategoryType Enumeration. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.settings.forwardingAddresses/delete

Send feedback

# Method: users.settings.forwardingAddresses.delete Stay organized with collections Save and categorize content based on your preferences.

* [HTTP request](#body.HTTP_TEMPLATE)
* [Path parameters](#body.PATH_PARAMETERS)
* [Request body](#body.request_body)
* [Response body](#body.response_body)
* [Authorization scopes](#body.aspect)
* [Try it!](#try-it)

Deletes the specified forwarding address and revokes any verification that may have been required.

This method is only available to service account clients that have been delegated domain-wide authority.

### HTTP request

`DELETE https://gmail.googleapis.com/gmail/v1/users/{userId}/settings/forwardingAddresses/{forwardingEmail}`

The URL uses [gRPC Transcoding](https://google.aip.dev/127) syntax.

### Path parameters

| Parameters | |
| --- | --- |
| `userId` | `string`  User's email address. The special value "me" can be used to indicate the authenticated user. |
| `forwardingEmail` | `string`  The forwarding address to be deleted. |

### Request body

The request body must be empty.

### Response body

If successful, the response body is an empty JSON object.

### Authorization scopes

Requires the following OAuth scope:

* `https://www.googleapis.com/auth/gmail.settings.sharing`

For more information, see the [OAuth 2.0 Overview](/identity/protocols/OAuth2).




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.settings.delegates

Send feedback

# REST Resource: users.settings.delegates Stay organized with collections Save and categorize content based on your preferences.

* [Resource: Delegate](#Delegate)
  + [JSON representation](#Delegate.SCHEMA_REPRESENTATION)
* [VerificationStatus](#VerificationStatus)
* [Methods](#METHODS_SUMMARY)

## Resource: Delegate

Settings for a delegate. Delegates can read, send, and delete messages, as well as view and add contacts, for the delegator's account. See ["Set up mail delegation"](https://support.google.com/mail/answer/138350) for more information about delegates.

| JSON representation |
| --- |
| ``` {   "delegateEmail": string,   "verificationStatus": enum (VerificationStatus) } ``` |

| Fields | |
| --- | --- |
| `delegateEmail` | `string`  The email address of the delegate. |
| `verificationStatus` | `enum (VerificationStatus)`  Indicates whether this address has been verified and can act as a delegate for the account. Read-only. |

## VerificationStatus

Indicates whether ownership of an email address has been verified for delegation use.

| Enums | |
| --- | --- |
| `verificationStatusUnspecified` | Unspecified verification status. |
| `accepted` | The address can act a delegate for the account. |
| `pending` | A verification request was mailed to the address, and the owner has not yet accepted it. |
| `rejected` | A verification request was mailed to the address, and the owner rejected it. |
| `expired` | A verification request was mailed to the address, and it expired without verification. |

| Methods | |
| --- | --- |
| `create` | Adds a delegate with its verification status set directly to `accepted`, without sending any verification email. |
| `delete` | Removes the specified delegate (which can be of any verification status), and revokes any verification that may have been required for using it. |
| `get` | Gets the specified delegate. |
| `list` | Lists the delegates for the specified account. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/ItemListOrderType

Send feedback

# ItemListOrderType Stay organized with collections Save and categorize content based on your preferences.

Type name: [ItemListOrderType](/workspace/gmail/markup/reference/types/ItemListOrderType)

Extends [Enumeration](/workspace/gmail/markup/reference/types/Enumeration)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/Volcano

Send feedback

# Volcano Stay organized with collections Save and categorize content based on your preferences.

Type name: [Volcano](/workspace/gmail/markup/reference/types/Volcano)

Extends [Landform](/workspace/gmail/markup/reference/types/Landform)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/ComedyClub

Send feedback

# ComedyClub Stay organized with collections Save and categorize content based on your preferences.

Type name: [ComedyClub](/workspace/gmail/markup/reference/types/ComedyClub)

Extends [EntertainmentBusiness](/workspace/gmail/markup/reference/types/EntertainmentBusiness)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/LymphaticVessel

Send feedback

# LymphaticVessel Stay organized with collections Save and categorize content based on your preferences.

Type name: [LymphaticVessel](/workspace/gmail/markup/reference/types/LymphaticVessel)

Extends [Vessel](/workspace/gmail/markup/reference/types/Vessel)

| Name | Type | Description |
| --- | --- | --- |
| originatesFrom | [Vessel](/workspace/gmail/markup/reference/types/Vessel) | The vasculature the lymphatic structure originates, or afferents, from. |
| regionDrained | [AnatomicalStructure](/workspace/gmail/markup/reference/types/AnatomicalStructure) or [AnatomicalSystem](/workspace/gmail/markup/reference/types/AnatomicalSystem) | The anatomical or organ system drained by this vessel; generally refers to a specific part of an organ. |
| runsTo | [Vessel](/workspace/gmail/markup/reference/types/Vessel) | The vasculature the lymphatic structure runs, or efferents, to. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/event-reservation

Send feedback

# Event Reservation Stay organized with collections Save and categorize content based on your preferences.

Use this type to declare a reservation for one or more guests at an event. Tickets may be declared as well.

## Use cases

The following use cases show common examples of how the `EventReservation` schema is used. Use these examples to ensure that your markup is properly structured.

**Note:** Before you start, make sure you understand how to [embed schemas in emails](/workspace/gmail/markup/embedding-schemas-in-emails) and you are familiar with [testing schemas](/workspace/gmail/markup/testing-your-schema).

### Basic event reminder without a ticket

If you are sending out an email confirming a user’s attendance to an event, include the following markup. This is an example of the minimal amount of markup that will qualify your email as an `EventReservation`.

[JSON-LD](#json-ld)[Microdata](#microdata)
More

```
<script type="application/ld+json">
{
  "@context": "http://schema.org",
  "@type": "EventReservation",
  "reservationNumber": "E123456789",
  "reservationStatus": "http://schema.org/Confirmed",
  "underName": {
    "@type": "Person",
    "name": "John Smith"
  },
  "reservationFor": {
    "@type": "Event",
    "name": "Foo Fighters Concert",
    "startDate": "2027-03-06T19:30:00-08:00",
    "location": {
      "@type": "Place",
      "name": "AT&T Park",
      "address": {
        "@type": "PostalAddress",
        "streetAddress": "24 Willie Mays Plaza",
        "addressLocality": "San Francisco",
        "addressRegion": "CA",
        "postalCode": "94107",
        "addressCountry": "US"
      }
    }
  }
}
</script>
```

```
<div itemscope itemtype="http://schema.org/EventReservation">
  <meta itemprop="reservationNumber" content="E123456789"/>
  <link itemprop="reservationStatus" href="http://schema.org/Confirmed"/>
  <div itemprop="underName" itemscope itemtype="http://schema.org/Person">
    <meta itemprop="name" content="John Smith"/>
  </div>
  <div itemprop="reservationFor" itemscope itemtype="http://schema.org/Event">
    <meta itemprop="name" content="Foo Fighters Concert"/>
    <meta itemprop="startDate" content="2027-03-06T19:30:00-08:00"/>
    <div itemprop="location" itemscope itemtype="http://schema.org/Place">
      <meta itemprop="name" content="AT&T Park"/>
      <div itemprop="address" itemscope itemtype="http://schema.org/PostalAddress">
        <meta itemprop="streetAddress" content="24 Willie Mays Plaza"/>
        <meta itemprop="addressLocality" content="San Francisco"/>
        <meta itemprop="addressRegion" content="CA"/>
        <meta itemprop="postalCode" content="94107"/>
        <meta itemprop="addressCountry" content="US"/>
      </div>
    </div>
  </div>
</div>
```

### Event with ticket & no reserved seating

Include the `ticketToken`, `ticketNumber` and `numSeats` fields to add information about the tickets.

[JSON-LD](#json-ld)[Microdata](#microdata)
More

```
<script type="application/ld+json">
{
  "@context": "http://schema.org",
  "@type": "EventReservation",
  "reservationNumber": "E123456789",
  "reservationStatus": "http://schema.org/Confirmed",
  "underName": {
    "@type": "Person",
    "name": "John Smith"
  },
  "reservationFor": {
    "@type": "Event",
    "name": "Foo Fighters Concert",
    "performer": {
      "@type": "Organization",
      "name": "The Foo Fighters",
      "image": "http://www.amprocktv.com/wp-content/uploads/2027/01/foo-fighters-1-680x383.jpg"
    },
    "startDate": "2027-03-06T19:30:00-08:00",
    "location": {
      "@type": "Place",
      "name": "AT&T Park",
      "address": {
        "@type": "PostalAddress",
        "streetAddress": "24 Willie Mays Plaza",
        "addressLocality": "San Francisco",
        "addressRegion": "CA",
        "postalCode": "94107",
        "addressCountry": "US"
      }
    }
  },
  "ticketToken": "qrCode:AB34",
  "ticketNumber": "abc123",
  "numSeats": "1"
}
</script>
```

```
<div itemscope itemtype="http://schema.org/EventReservation">
  <meta itemprop="reservationNumber" content="E123456789"/>
  <link itemprop="reservationStatus" href="http://schema.org/Confirmed"/>
  <div itemprop="underName" itemscope itemtype="http://schema.org/Person">
    <meta itemprop="name" content="John Smith"/>
  </div>
  <div itemprop="reservationFor" itemscope itemtype="http://schema.org/Event">
    <meta itemprop="name" content="Foo Fighters Concert"/>
    <div itemprop="performer" itemscope itemtype="http://schema.org/Organization">
      <meta itemprop="name" content="The Foo Fighters"/>
      <link itemprop="image" href="http://www.amprocktv.com/wp-content/uploads/2027/01/foo-fighters-1-680x383.jpg"/>
    </div>
    <meta itemprop="startDate" content="2027-03-06T19:30:00-08:00"/>
    <div itemprop="location" itemscope itemtype="http://schema.org/Place">
      <meta itemprop="name" content="AT&T Park"/>
      <div itemprop="address" itemscope itemtype="http://schema.org/PostalAddress">
        <meta itemprop="streetAddress" content="24 Willie Mays Plaza"/>
        <meta itemprop="addressLocality" content="San Francisco"/>
        <meta itemprop="addressRegion" content="CA"/>
        <meta itemprop="postalCode" content="94107"/>
        <meta itemprop="addressCountry" content="US"/>
      </div>
    </div>
  </div>
  <meta itemprop="ticketToken" content="qrCode:AB34"/>
  <meta itemprop="ticketNumber" content="abc123"/>
  <meta itemprop="numSeats" content="1"/>
</div>
```

### Sports or Music Event with ticket

Set the `reservationFor` type to either `MusicEvent` or `SportsEvent`.
If the event is a `MusicEvent` (e.g. a concert) you should include `performer.name` and `performer.image`. If the event is a `SportsEvent` (e.g. a basket ball game) where there are two competing teams or players include the two teams as performers.

[JSON-LD](#json-ld)[Microdata](#microdata)
More

```
<script type="application/ld+json">
{
  "@context": "http://schema.org",
  "@type": "EventReservation",
  "reservationNumber": "E123456789",
  "reservationStatus": "http://schema.org/Confirmed",
  "underName": {
    "@type": "Person",
    "name": "John Smith"
  },
  "reservationFor": {
    "@type": "MusicEvent",
    "name": "Foo Fighters Concert",
    "url": "http://foofighterstour.com/SFO",
    "performer": {
      "@type": "Organization",
      "name": "The Foo Fighters",
      "image": "http://www.amprocktv.com/wp-content/uploads/2027/01/foo-fighters-1-680x383.jpg"
    },
    "startDate": "2027-03-06T19:30:00-08:00",
    "endDate": "2027-03-06T23:00:00-08:00",
    "doorTime": "2027-03-06T16:30:00-08:00",
    "location": {
      "@type": "Place",
      "name": "AT&T Park",
      "address": {
        "@type": "PostalAddress",
        "streetAddress": "AT&T Park",
        "addressLocality": "San Francisco",
        "addressRegion": "CA",
        "postalCode": "94107",
        "addressCountry": "US"
      }
    }
  },
  "ticketToken": "qrCode:AB34",
  "ticketNumber": "abc123",
  "numSeats": "1"
}
</script>
```

```
<div itemscope itemtype="http://schema.org/EventReservation">
  <meta itemprop="reservationNumber" content="E123456789"/>
  <link itemprop="reservationStatus" href="http://schema.org/Confirmed"/>
  <div itemprop="underName" itemscope itemtype="http://schema.org/Person">
    <meta itemprop="name" content="John Smith"/>
  </div>
  <div itemprop="reservationFor" itemscope itemtype="http://schema.org/MusicEvent">
    <meta itemprop="name" content="Foo Fighters Concert"/>
    <link itemprop="url" href="http://foofighterstour.com/SFO"/>
    <div itemprop="performer" itemscope itemtype="http://schema.org/Organization">
      <meta itemprop="name" content="The Foo Fighters"/>
      <link itemprop="image" href="http://www.amprocktv.com/wp-content/uploads/2027/01/foo-fighters-1-680x383.jpg"/>
    </div>
    <meta itemprop="startDate" content="2027-03-06T19:30:00-08:00"/>
    <meta itemprop="endDate" content="2027-03-06T23:00:00-08:00"/>
    <meta itemprop="doorTime" content="2027-03-06T16:30:00-08:00"/>
    <div itemprop="location" itemscope itemtype="http://schema.org/Place">
      <meta itemprop="name" content="AT&T Park"/>
      <div itemprop="address" itemscope itemtype="http://schema.org/PostalAddress">
        <meta itemprop="streetAddress" content="AT&T Park"/>
        <meta itemprop="addressLocality" content="San Francisco"/>
        <meta itemprop="addressRegion" content="CA"/>
        <meta itemprop="postalCode" content="94107"/>
        <meta itemprop="addressCountry" content="US"/>
      </div>
    </div>
  </div>
  <meta itemprop="ticketToken" content="qrCode:AB34"/>
  <meta itemprop="ticketNumber" content="abc123"/>
  <meta itemprop="numSeats" content="1"/>
</div>
```

### Event with ticket & reserved seating

For a single ticket with reserved seating, include `ticketToken`, `ticketNumber`, `venueSeat`, `venueRow` and `venueSection`.
You only need to include whichever of `venueSeat`, `venueRow`, and `venueSection` is needed to describe the location of the seat.

Do not include `numSeats`.

[JSON-LD](#json-ld)[Microdata](#microdata)
More

```
<script type="application/ld+json">
{
  "@context": "http://schema.org",
  "@type": "EventReservation",
  "reservationNumber": "E123456789",
  "reservationStatus": "http://schema.org/Confirmed",
  "underName": {
    "@type": "Person",
    "name": "John Smith"
  },
  "reservationFor": {
    "@type": "Event",
    "name": "Foo Fighters Concert",
    "performer": {
      "@type": "Organization",
      "name": "The Foo Fighters",
      "image": "http://www.amprocktv.com/wp-content/uploads/2027/01/foo-fighters-1-680x383.jpg"
    },
    "startDate": "2027-03-06T19:30:00-08:00",
    "location": {
      "@type": "Place",
      "name": "AT&T Park",
      "address": {
        "@type": "PostalAddress",
        "streetAddress": "24 Willie Mays Plaza",
        "addressLocality": "San Francisco",
        "addressRegion": "CA",
        "postalCode": "94107",
        "addressCountry": "US"
      }
    }
  },
  "venueSeat": "12",
  "venueRow": "A",
  "venueSection": "101",
  "ticketToken": "qrCode:AB34",
  "ticketNumber": "abc123"
}
</script>
```

```
<div itemscope itemtype="http://schema.org/EventReservation">
  <meta itemprop="reservationNumber" content="E123456789"/>
  <link itemprop="reservationStatus" href="http://schema.org/Confirmed"/>
  <div itemprop="underName" itemscope itemtype="http://schema.org/Person">
    <meta itemprop="name" content="John Smith"/>
  </div>
  <div itemprop="reservationFor" itemscope itemtype="http://schema.org/Event">
    <meta itemprop="name" content="Foo Fighters Concert"/>
    <div itemprop="performer" itemscope itemtype="http://schema.org/Organization">
      <meta itemprop="name" content="The Foo Fighters"/>
      <link itemprop="image" href="http://www.amprocktv.com/wp-content/uploads/2027/01/foo-fighters-1-680x383.jpg"/>
    </div>
    <meta itemprop="startDate" content="2027-03-06T19:30:00-08:00"/>
    <div itemprop="location" itemscope itemtype="http://schema.org/Place">
      <meta itemprop="name" content="AT&T Park"/>
      <div itemprop="address" itemscope itemtype="http://schema.org/PostalAddress">
        <meta itemprop="streetAddress" content="24 Willie Mays Plaza"/>
        <meta itemprop="addressLocality" content="San Francisco"/>
        <meta itemprop="addressRegion" content="CA"/>
        <meta itemprop="postalCode" content="94107"/>
        <meta itemprop="addressCountry" content="US"/>
      </div>
    </div>
  </div>
  <meta itemprop="venueSeat" content="12"/>
  <meta itemprop="venueRow" content="A"/>
  <meta itemprop="venueSection" content="101"/>
  <meta itemprop="ticketToken" content="qrCode:AB34"/>
  <meta itemprop="ticketNumber" content="abc123"/>
</div>
```

### Multiple tickets

There are two options to do multiple tickets:

* The first is the change `numSeats`. This means a single reservation will represent tickets for `numSeats` number of individuals.
* If you want to have one ticket (i.e. barcode) per individual and have names for each individual on the ticket, create multiple `EventReservations` (one per individual) with `numSeats` set to 1. The example below shows what this looks like.

[JSON-LD](#json-ld)[Microdata](#microdata)
More

```
<script type="application/ld+json">
[
  {
    "@context": "http://schema.org",
    "@type": "EventReservation",
    "reservationNumber": "E123456789",
    "reservationStatus": "http://schema.org/Confirmed",
    "underName": {
      "@type": "Person",
      "name": "John Smith"
    },
    "reservationFor": {
      "@type": "Event",
      "name": "Foo Fighters Concert",
      "performer": {
        "@type": "Person",
        "name": "The Foo Fighters",
        "image": "http://www.amprocktv.com/wp-content/uploads/2027/01/foo-fighters-1-680x383.jpg"
      },
      "startDate": "2027-03-06T19:30:00-08:00",
      "location": {
        "@type": "Place",
        "name": "AT&T Park",
        "address": {
          "@type": "PostalAddress",
          "streetAddress": "24 Willie Mays Plaza",
          "addressLocality": "San Francisco",
          "addressRegion": "CA",
          "postalCode": "94107",
          "addressCountry": "US"
        }
      }
    },
    "venueSeat": "12",
    "venueRow": "A",
    "venueSection": "101",
    "ticketToken": "qrCode:AB34",
    "ticketNumber": "abc123"
  },
  {
    "@context": "http://schema.org",
    "@type": "EventReservation",
    "reservationNumber": "E123456789",
    "reservationStatus": "http://schema.org/Confirmed",
    "underName": {
      "@type": "Person",
      "name": "Eva Green"
    },
    "reservationFor": {
      "@type": "Event",
      "name": "Foo Fighters Concert",
      "performer": {
        "@type": "Organization",
        "name": "The Foo Fighters",
        "image": "http://www.amprocktv.com/wp-content/uploads/2027/01/foo-fighters-1-680x383.jpg"
      },
      "startDate": "2027-03-06T19:30:00-08:00",
      "location": {
        "@type": "Place",
        "name": "AT&T Park",
        "address": {
          "@type": "PostalAddress",
          "streetAddress": "24 Willie Mays Plaza",
          "addressLocality": "San Francisco",
          "addressRegion": "CA",
          "postalCode": "94107",
          "addressCountry": "US"
        }
      }
    },
    "venueSeat": "13",
    "venueRow": "A",
    "venueSection": "101",
    "ticketToken": "qrCode:AB34",
    "ticketNumber": "abc456"
  }
]
</script>
```

```
<div itemscope itemtype="http://schema.org/EventReservation">
  <meta itemprop="reservationNumber" content="E123456789"/>
  <link itemprop="reservationStatus" href="http://schema.org/Confirmed"/>
  <div itemprop="underName" itemscope itemtype="http://schema.org/Person">
    <meta itemprop="name" content="John Smith"/>
  </div>
  <div itemprop="reservationFor" itemscope itemtype="http://schema.org/Event">
    <meta itemprop="name" content="Foo Fighters Concert"/>
   <div itemprop="performer" itemscope itemtype="http://schema.org/Person">
      <meta itemprop="name" content="The Foo Fighters"/>
      <link itemprop="image" href="http://www.amprocktv.com/wp-content/uploads/2027/01/foo-fighters-1-680x383.jpg"/>
    </div>
    <meta itemprop="startDate" content="2027-03-06T19:30:00-08:00"/>
    <div itemprop="location" itemscope itemtype="http://schema.org/Place">
      <meta itemprop="name" content="AT&T Park"/>
      <div itemprop="address" itemscope itemtype="http://schema.org/PostalAddress">
        <meta itemprop="streetAddress" content="24 Willie Mays Plaza"/>
        <meta itemprop="addressLocality" content="San Francisco"/>
        <meta itemprop="addressRegion" content="CA"/>
        <meta itemprop="postalCode" content="94107"/>
        <meta itemprop="addressCountry" content="US"/>
      </div>
    </div>
  </div>
  <meta itemprop="venueSeat" content="12"/>
  <meta itemprop="venueRow" content="A"/>
  <meta itemprop="venueSection" content="101"/>
  <meta itemprop="ticketToken" content="qrCode:AB34"/>
  <meta itemprop="ticketNumber" content="abc123"/>
</div>
<div itemscope itemtype="http://schema.org/EventReservation">
  <meta itemprop="reservationNumber" content="E123456789"/>
  <link itemprop="reservationStatus" href="http://schema.org/Confirmed"/>
  <div itemprop="underName" itemscope itemtype="http://schema.org/Person">
    <meta itemprop="name" content="Eva Green"/>
  </div>
  <div itemprop="reservationFor" itemscope itemtype="http://schema.org/Event">
    <meta itemprop="name" content="Foo Fighters Concert"/>
    <div itemprop="performer" itemscope itemtype="http://schema.org/Organization">
      <meta itemprop="name" content="The Foo Fighters"/>
      <link itemprop="image" href="http://www.amprocktv.com/wp-content/uploads/2027/01/foo-fighters-1-680x383.jpg"/>
    </div>
    <meta itemprop="startDate" content="2027-03-06T19:30:00-08:00"/>
    <div itemprop="location" itemscope itemtype="http://schema.org/Place">
      <meta itemprop="name" content="AT&T Park"/>
      <div itemprop="address" itemscope itemtype="http://schema.org/PostalAddress">
        <meta itemprop="streetAddress" content="24 Willie Mays Plaza"/>
        <meta itemprop="addressLocality" content="San Francisco"/>
        <meta itemprop="addressRegion" content="CA"/>
        <meta itemprop="postalCode" content="94107"/>
        <meta itemprop="addressCountry" content="US"/>
      </div>
    </div>
  </div>
  <meta itemprop="venueSeat" content="13"/>
  <meta itemprop="venueRow" content="A"/>
  <meta itemprop="venueSection" content="101"/>
  <meta itemprop="ticketToken" content="qrCode:AB34"/>
  <meta itemprop="ticketNumber" content="abc456"/>
</div>
```

## Test your markup

You can validate your markup using the [Email Markup Tester Tool](https://www.google.com/webmasters/markup-tester/). Paste in your markup code and click the **Validate** button to scan the content and receive a report on any errors present.

## Specification

Review the details of your email to see if any of these properties apply to your event reservation. By marking up these additional properties you allow Google to display a much richer description of the event reservation to the user.

# EventReservation

Type name: [EventReservation](/workspace/gmail/markup/reference/types/EventReservation)

Extends [Reservation](/workspace/gmail/markup/reference/types/Reservation)

| Name | Type | Description |
| --- | --- | --- |
| **action** | [Action](/workspace/gmail/markup/reference/types/Action) | An action that can be taken upon this thing. |
| action.**name** | [Text](/workspace/gmail/markup/reference/types/Text) | The string shown to the user on the UI element tied to the action. |
| action.**url** | [URL](/workspace/gmail/markup/reference/types/URL) | Target url for the action. If no explicit handler field is provided the action handler is expanded into a WebActionHandler with this url as the WebActionHandler url. |
| **additionalTicketText** | [Text](/workspace/gmail/markup/reference/types/Text) | Additional information about the ticket. |
| **bookingAgent** | [Organization](/workspace/gmail/markup/reference/types/Organization) or [Person](/workspace/gmail/markup/reference/types/Person) | Booking agent or agency. Also accepts a string (e.g. ""). |
| bookingAgent.**image** | [URL](/workspace/gmail/markup/reference/types/URL) | URL of an image of the Organization. |
| bookingAgent.**name** | [Text](/workspace/gmail/markup/reference/types/Text) | Name of the agent/service. |
| bookingAgent.**url** | [URL](/workspace/gmail/markup/reference/types/URL) | Website of the agent/service. |
| **bookingTime** | [DateTime](/workspace/gmail/markup/reference/types/DateTime) | Date the reservation was made. |
| **cancelReservationUrl** | [URL](/workspace/gmail/markup/reference/types/URL) | Web page where reservation can be cancelled. |
| **confirmReservationUrl** | [URL](/workspace/gmail/markup/reference/types/URL) | Web page where reservation can be confirmed. |
| **modifiedTime** | [DateTime](/workspace/gmail/markup/reference/types/DateTime) | (recommended for Confirmation Cards/Search Answers) Time the reservation was last modified. |
| **modifyReservationUrl** | [URL](/workspace/gmail/markup/reference/types/URL) | (recommended for Confirmation Cards/Search Answers) Web page where reservation can be modified. |
| **numSeats** | [Number](/workspace/gmail/markup/reference/types/Number) | The number of seats. |
| **price** | [Text](/workspace/gmail/markup/reference/types/Text) | Total price of the EventReservation. |
| **priceCurrency** | [Text](/workspace/gmail/markup/reference/types/Text) | The currency (in 3-letter ISO 4217 format) of the EventReservation's price. |
| **programMembership** | [ProgramMembership](/workspace/gmail/markup/reference/types/ProgramMembership) | Any membership in a frequent flyer, hotel loyalty program, etc. being applied to the reservation. |
| programMembership.**memberNumber** | [Text](/workspace/gmail/markup/reference/types/Text) | The identifier of the membership. |
| programMembership.**program** | [Text](/workspace/gmail/markup/reference/types/Text) | The name of the program. |
| **reservationFor**  **(Required)** | [Event](/workspace/gmail/markup/reference/types/Event) | Can use Event, or any of the event subtypes, including BusinessEvent, ChildrenEvent, ComedyEvent, DanceEvent, EducationEvent, Festival, FoodEvent, LiteraryEvent, MovieShowing, MusicEvent, SaleEvent, SocialEvent, SportsEvent, TheaterEvent, VisualArtsEvent. |
| reservationFor.**description** | [Text](/workspace/gmail/markup/reference/types/Text) | A short description of the Event. |
| reservationFor.**doorTime** | [DateTime](/workspace/gmail/markup/reference/types/DateTime) | The time admission will commence. |
| reservationFor.**endDate** | [DateTime](/workspace/gmail/markup/reference/types/DateTime) | The end date and time of the event. |
| reservationFor.**image** | [URL](/workspace/gmail/markup/reference/types/URL) | URL of an image of the Event. |
| reservationFor.**location**  **(Required)** | [Place](/workspace/gmail/markup/reference/types/Place) | The event's location. |
| reservationFor.location.**address**  **(Required)** | [PostalAddress](/workspace/gmail/markup/reference/types/PostalAddress) | Address of the the event's location. |
| reservationFor.location.address.**addressCountry**  **(Required)** | [Text](/workspace/gmail/markup/reference/types/Text) or [Country](/workspace/gmail/markup/reference/types/Country) | Country of the event's location. |
| reservationFor.location.address.**addressLocality**  **(Required)** | [Text](/workspace/gmail/markup/reference/types/Text) | Locality (e.g. city) of the event's location. |
| reservationFor.location.address.**addressRegion**  **(Required)** | [Text](/workspace/gmail/markup/reference/types/Text) | Region (e.g. State) of the event's location. |
| reservationFor.location.address.**postalCode**  **(Required)** | [Text](/workspace/gmail/markup/reference/types/Text) | Postal code of the event's location. |
| reservationFor.location.address.**streetAddress**  **(Required)** | [Text](/workspace/gmail/markup/reference/types/Text) | Street address of the event's location. |
| reservationFor.location.**name**  **(Required)** | [Text](/workspace/gmail/markup/reference/types/Text) | Name of the the event's location. |
| reservationFor.**name**  **(Required)** | [Text](/workspace/gmail/markup/reference/types/Text) | Event's name. |
| reservationFor.**performer** | [Person](/workspace/gmail/markup/reference/types/Person) or [Organization](/workspace/gmail/markup/reference/types/Organization) | (recommended for Confirmation Cards/Search Answers) The event's performer. Also accepts an array of objects. |
| reservationFor.performer.**image** | [URL](/workspace/gmail/markup/reference/types/URL) | (recommended for Confirmation Cards/Search Answers) URL of an image of the Person. |
| reservationFor.performer.**name** | [Text](/workspace/gmail/markup/reference/types/Text) | (recommended for Confirmation Cards/Search Answers) Name of the Person. |
| reservationFor.performer.**url** | [URL](/workspace/gmail/markup/reference/types/URL) | URL of the Person. |
| reservationFor.**startDate**  **(Required)** | [DateTime](/workspace/gmail/markup/reference/types/DateTime) | The start date and time of the event. |
| reservationFor.**url** | [URL](/workspace/gmail/markup/reference/types/URL) | URL of the Event. |
| **reservationNumber**  **(Required)** | [Text](/workspace/gmail/markup/reference/types/Text) | The number or id of the reservation. |
| **reservationStatus**  **(Required)** | [ReservationStatus](/workspace/gmail/markup/reference/types/ReservationStatus) | Current status of the reservation. |
| **ticketDownloadUrl** | [URL](/workspace/gmail/markup/reference/types/URL) | Where the ticket can be downloaded. |
| **ticketNumber** | [Text](/workspace/gmail/markup/reference/types/Text) | The number or id of the ticket. |
| **ticketPrintUrl** | [URL](/workspace/gmail/markup/reference/types/URL) | Where the ticket can be printed. |
| **ticketToken** | [Text](/workspace/gmail/markup/reference/types/Text) or [URL](/workspace/gmail/markup/reference/types/URL) | If the barcode image is hosted on your site, the value of the field is URL of the image, or a barcode or QR URI, such as "barcode128:AB34" (ISO-15417 barcodes), "qrCode:AB34" (QR codes), "aztecCode:AB34" (Aztec codes), "barcodeEAN:1234" (EAN codes) and "barcodeUPCA:1234" (UPCA codes). |
| **underName**  **(Required)** | [Person](/workspace/gmail/markup/reference/types/Person) or [Organization](/workspace/gmail/markup/reference/types/Organization) | The ticket holder. |
| underName.**email** | [Text](/workspace/gmail/markup/reference/types/Text) | Email address. |
| underName.**name**  **(Required)** | [Text](/workspace/gmail/markup/reference/types/Text) | Name of the Person. |
| **url** | [URL](/workspace/gmail/markup/reference/types/URL) | Web page where reservation can be viewed. |
| **venueRow** | [Text](/workspace/gmail/markup/reference/types/Text) | The seat's row. |
| **venueSeat** | [Text](/workspace/gmail/markup/reference/types/Text) | The seat number. |
| **venueSection** | [Text](/workspace/gmail/markup/reference/types/Text) | The seat's section. |

**Note:** Some of the schemas used by Google are still going through the standardization process of [schema.org](http://schema.org), and therefore, may change in the future. [Learn More](/workspace/gmail/markup/reference/schema-org-proposals).




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/CollegeOrUniversity

Send feedback

# CollegeOrUniversity Stay organized with collections Save and categorize content based on your preferences.

Type name: [CollegeOrUniversity](/workspace/gmail/markup/reference/types/CollegeOrUniversity)

Extends [EducationalOrganization](/workspace/gmail/markup/reference/types/EducationalOrganization)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/AutoDealer

Send feedback

# AutoDealer Stay organized with collections Save and categorize content based on your preferences.

Type name: [AutoDealer](/workspace/gmail/markup/reference/types/AutoDealer)

Extends [AutomotiveBusiness](/workspace/gmail/markup/reference/types/AutomotiveBusiness)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/ClothingStore

Send feedback

# ClothingStore Stay organized with collections Save and categorize content based on your preferences.

Type name: [ClothingStore](/workspace/gmail/markup/reference/types/ClothingStore)

Extends [Store](/workspace/gmail/markup/reference/types/Store)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/postmaster/reference/rest/v2/QueryDomainStatsResponse

Send feedback

# QueryDomainStatsResponse Stay organized with collections Save and categorize content based on your preferences.

* [JSON representation](#SCHEMA_REPRESENTATION)
* [DomainStat](#DomainStat)
  + [JSON representation](#DomainStat.SCHEMA_REPRESENTATION)
* [StatisticValue](#StatisticValue)
  + [JSON representation](#StatisticValue.SCHEMA_REPRESENTATION)
* [StringList](#StringList)
  + [JSON representation](#StringList.SCHEMA_REPRESENTATION)

Response message for QueryDomainStats.

| JSON representation |
| --- |
| ``` {   "domainStats": [     {       object (DomainStat)     }   ],   "nextPageToken": string } ``` |

| Fields | |
| --- | --- |
| `domainStats[]` | `object (DomainStat)`  The list of domain statistics. Each DomainStat object contains the value for a metric requested in the QueryDomainStatsRequest. |
| `nextPageToken` | `string`  Token to retrieve the next page of results, or empty if there are no more results in the list. |

## DomainStat

Email statistics for a domain for a specified time period or date.

| JSON representation |
| --- |
| ``` {   "name": string,   "value": {     object (StatisticValue)   },   "date": {     object (Date)   },   "metric": string } ``` |

| Fields | |
| --- | --- |
| `name` | `string`  Output only. The resource name of the DomainStat resource. Format: domains/{domain}/domainStats/{domain\_stat} The `{domain_stat}` segment is an opaque, server-generated ID. We recommend using the `metric` field to identify queried metrics instead of parsing the name. |
| `value` | `object (StatisticValue)`  The value of the corresponding metric. |
| `date` | `object (Date)`  Optional. The specific date for these stats, if granularity is DAILY. This field is populated if the QueryDomainStatsRequest specified a DAILY aggregation granularity. |
| `metric` | `string`  The user-defined name from MetricDefinition.name in the request, used to correlate this result with the requested metric. |

## StatisticValue

The actual value of a statistic.

| JSON representation |
| --- |
| ``` {    // Union field value can be only one of the following:   "intValue": string,   "doubleValue": number,   "stringValue": string,   "floatValue": number,   "stringList": {     object (StringList)   }   // End of list of possible types for union field value. } ``` |

| Fields | |
| --- | --- |
| Union field `value`. The specific value of the statistic. `value` can be only one of the following: | |
| `intValue` | `string (int64 format)`  Integer value. |
| `doubleValue` | `number`  Double value. |
| `stringValue` | `string`  String value. |
| `floatValue` | `number`  Float value. |
| `stringList` | `object (StringList)`  List of string values. |

## StringList

Represents a list of strings.

| JSON representation |
| --- |
| ``` {   "values": [     string   ] } ``` |

| Fields | |
| --- | --- |
| `values[]` | `string`  The string values. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/LandmarksOrHistoricalBuildings

Send feedback

# LandmarksOrHistoricalBuildings Stay organized with collections Save and categorize content based on your preferences.

Type name: [LandmarksOrHistoricalBuildings](/workspace/gmail/markup/reference/types/LandmarksOrHistoricalBuildings)

Extends [Place](/workspace/gmail/markup/reference/types/Place)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/MedicalSpecialty

Send feedback

# MedicalSpecialty Stay organized with collections Save and categorize content based on your preferences.

Type name: [MedicalSpecialty](/workspace/gmail/markup/reference/types/MedicalSpecialty)

Extends [Enumeration](/workspace/gmail/markup/reference/types/Enumeration), [MedicalEnumeration](/workspace/gmail/markup/reference/types/MedicalEnumeration) or [Specialty](/workspace/gmail/markup/reference/types/Specialty)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/ChildCare

Send feedback

# ChildCare Stay organized with collections Save and categorize content based on your preferences.

Type name: [ChildCare](/workspace/gmail/markup/reference/types/ChildCare)

Extends [LocalBusiness](/workspace/gmail/markup/reference/types/LocalBusiness)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.settings.delegates/delete

Send feedback

# Method: users.settings.delegates.delete Stay organized with collections Save and categorize content based on your preferences.

* [HTTP request](#body.HTTP_TEMPLATE)
* [Path parameters](#body.PATH_PARAMETERS)
* [Request body](#body.request_body)
* [Response body](#body.response_body)
* [Authorization scopes](#body.aspect)
* [Try it!](#try-it)

Removes the specified delegate (which can be of any verification status), and revokes any verification that may have been required for using it.

Note that a delegate user must be referred to by their primary email address, and not an email alias.

This method is only available to service account clients that have been delegated domain-wide authority.

### HTTP request

`DELETE https://gmail.googleapis.com/gmail/v1/users/{userId}/settings/delegates/{delegateEmail}`

The URL uses [gRPC Transcoding](https://google.aip.dev/127) syntax.

### Path parameters

| Parameters | |
| --- | --- |
| `userId` | `string`  User's email address. The special value "me" can be used to indicate the authenticated user. |
| `delegateEmail` | `string`  The email address of the user to be removed as a delegate. |

### Request body

The request body must be empty.

### Response body

If successful, the response body is an empty JSON object.

### Authorization scopes

Requires the following OAuth scope:

* `https://www.googleapis.com/auth/gmail.settings.sharing`

For more information, see the [OAuth 2.0 Overview](/identity/protocols/OAuth2).




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.settings.sendAs/update

Send feedback

# Method: users.settings.sendAs.update Stay organized with collections Save and categorize content based on your preferences.

* [HTTP request](#body.HTTP_TEMPLATE)
* [Path parameters](#body.PATH_PARAMETERS)
* [Request body](#body.request_body)
* [Response body](#body.response_body)
* [Authorization scopes](#body.aspect)
* [Try it!](#try-it)

Updates a send-as alias. If a signature is provided, Gmail will sanitize the HTML before saving it with the alias.

Addresses other than the primary address for the account can only be updated by service account clients that have been delegated domain-wide authority.

### HTTP request

`PUT https://gmail.googleapis.com/gmail/v1/users/{userId}/settings/sendAs/{sendAsEmail}`

The URL uses [gRPC Transcoding](https://google.aip.dev/127) syntax.

### Path parameters

| Parameters | |
| --- | --- |
| `userId` | `string`  User's email address. The special value "me" can be used to indicate the authenticated user. |
| `sendAsEmail` | `string`  The send-as alias to be updated. |

### Request body

The request body contains an instance of `SendAs`.

### Response body

If successful, the response body contains an instance of `SendAs`.

### Authorization scopes

Requires one of the following OAuth scopes:

* `https://www.googleapis.com/auth/gmail.settings.basic`
* `https://www.googleapis.com/auth/gmail.settings.sharing`

For more information, see the [OAuth 2.0 Overview](/identity/protocols/OAuth2).




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/PhotographAction

Send feedback

# PhotographAction Stay organized with collections Save and categorize content based on your preferences.

Type name: [PhotographAction](/workspace/gmail/markup/reference/types/PhotographAction)

Extends [CreateAction](/workspace/gmail/markup/reference/types/CreateAction)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/DanceGroup

Send feedback

# DanceGroup Stay organized with collections Save and categorize content based on your preferences.

Type name: [DanceGroup](/workspace/gmail/markup/reference/types/DanceGroup)

Extends [PerformingGroup](/workspace/gmail/markup/reference/types/PerformingGroup)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/ImagingTest

Send feedback

# ImagingTest Stay organized with collections Save and categorize content based on your preferences.

Type name: [ImagingTest](/workspace/gmail/markup/reference/types/ImagingTest)

Extends [MedicalTest](/workspace/gmail/markup/reference/types/MedicalTest)

| Name | Type | Description |
| --- | --- | --- |
| imagingTechnique | [MedicalImagingTechnique](/workspace/gmail/markup/reference/types/MedicalImagingTechnique) | Imaging technique used. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/City

Send feedback

# City Stay organized with collections Save and categorize content based on your preferences.

Type name: [City](/workspace/gmail/markup/reference/types/City)

Extends [AdministrativeArea](/workspace/gmail/markup/reference/types/AdministrativeArea)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/MensClothingStore

Send feedback

# MensClothingStore Stay organized with collections Save and categorize content based on your preferences.

Type name: [MensClothingStore](/workspace/gmail/markup/reference/types/MensClothingStore)

Extends [Store](/workspace/gmail/markup/reference/types/Store)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/EatAction

Send feedback

# EatAction Stay organized with collections Save and categorize content based on your preferences.

Type name: [EatAction](/workspace/gmail/markup/reference/types/EatAction)

Extends [ConsumeAction](/workspace/gmail/markup/reference/types/ConsumeAction)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/Locksmith

Send feedback

# Locksmith Stay organized with collections Save and categorize content based on your preferences.

Type name: [Locksmith](/workspace/gmail/markup/reference/types/Locksmith)

Extends [HomeAndConstructionBusiness](/workspace/gmail/markup/reference/types/HomeAndConstructionBusiness) or [ProfessionalService](/workspace/gmail/markup/reference/types/ProfessionalService)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/QuantitativeValue

Send feedback

# QuantitativeValue Stay organized with collections Save and categorize content based on your preferences.

Type name: [QuantitativeValue](/workspace/gmail/markup/reference/types/QuantitativeValue)

Extends [StructuredValue](/workspace/gmail/markup/reference/types/StructuredValue)

| Name | Type | Description |
| --- | --- | --- |
| maxValue | [Number](/workspace/gmail/markup/reference/types/Number) | The upper value of some characteristic or property. |
| minValue | [Number](/workspace/gmail/markup/reference/types/Number) | The lower value of some characteristic or property. |
| unitCode | [Text](/workspace/gmail/markup/reference/types/Text) | The unit of measurement given using the UN/CEFACT Common Code (3 characters). |
| value | [Number](/workspace/gmail/markup/reference/types/Number) | The value of the product characteristic. |
| valueReference | [Enumeration](/workspace/gmail/markup/reference/types/Enumeration) or [StructuredValue](/workspace/gmail/markup/reference/types/StructuredValue) | A pointer to a secondary value that provides additional information on the original value, e.g. a reference temperature. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/DaySpa

Send feedback

# DaySpa Stay organized with collections Save and categorize content based on your preferences.

Type name: [DaySpa](/workspace/gmail/markup/reference/types/DaySpa)

Extends [HealthAndBeautyBusiness](/workspace/gmail/markup/reference/types/HealthAndBeautyBusiness)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/StadiumOrArena

Send feedback

# StadiumOrArena Stay organized with collections Save and categorize content based on your preferences.

Type name: [StadiumOrArena](/workspace/gmail/markup/reference/types/StadiumOrArena)

Extends [CivicStructure](/workspace/gmail/markup/reference/types/CivicStructure) or [SportsActivityLocation](/workspace/gmail/markup/reference/types/SportsActivityLocation)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/Rating

Send feedback

# Rating Stay organized with collections Save and categorize content based on your preferences.

Type name: [Rating](/workspace/gmail/markup/reference/types/Rating)

Extends [Intangible](/workspace/gmail/markup/reference/types/Intangible)

| Name | Type | Description |
| --- | --- | --- |
| bestRating | [Number](/workspace/gmail/markup/reference/types/Number) or [Text](/workspace/gmail/markup/reference/types/Text) | The highest value allowed in this rating system. If bestRating is omitted, 5 is assumed. |
| ratingValue | [Text](/workspace/gmail/markup/reference/types/Text) | The rating for the content. |
| worstRating | [Number](/workspace/gmail/markup/reference/types/Number) or [Text](/workspace/gmail/markup/reference/types/Text) | The lowest value allowed in this rating system. If worstRating is omitted, 1 is assumed. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/GamePlayMode

Send feedback

# GamePlayMode Stay organized with collections Save and categorize content based on your preferences.

Type name: [GamePlayMode](/workspace/gmail/markup/reference/types/GamePlayMode)

Extends [Enumeration](/workspace/gmail/markup/reference/types/Enumeration)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/MedicalConditionStage

Send feedback

# MedicalConditionStage Stay organized with collections Save and categorize content based on your preferences.

Type name: [MedicalConditionStage](/workspace/gmail/markup/reference/types/MedicalConditionStage)

Extends [MedicalIntangible](/workspace/gmail/markup/reference/types/MedicalIntangible)

| Name | Type | Description |
| --- | --- | --- |
| stageAsNumber | [Number](/workspace/gmail/markup/reference/types/Number) | The stage represented as a number, e.g. 3. |
| subStageSuffix | [Text](/workspace/gmail/markup/reference/types/Text) | The substage, e.g. 'a' for Stage IIIa. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/Casino

Send feedback

# Casino Stay organized with collections Save and categorize content based on your preferences.

Type name: [Casino](/workspace/gmail/markup/reference/types/Casino)

Extends [EntertainmentBusiness](/workspace/gmail/markup/reference/types/EntertainmentBusiness)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/ShoppingCenter

Send feedback

# ShoppingCenter Stay organized with collections Save and categorize content based on your preferences.

Type name: [ShoppingCenter](/workspace/gmail/markup/reference/types/ShoppingCenter)

Extends [LocalBusiness](/workspace/gmail/markup/reference/types/LocalBusiness)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/BookStore

Send feedback

# BookStore Stay organized with collections Save and categorize content based on your preferences.

Type name: [BookStore](/workspace/gmail/markup/reference/types/BookStore)

Extends [Store](/workspace/gmail/markup/reference/types/Store)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/api/reference/rest/v1/users

Send feedback

# REST Resource: users Stay organized with collections Save and categorize content based on your preferences.

* [Resource](#RESOURCE_REPRESENTATION)
* [Methods](#METHODS_SUMMARY)

## Resource

There is no persistent data associated with this resource.

| Methods | |
| --- | --- |
| `getProfile` | Gets the current user's Gmail profile. |
| `stop` | Stop receiving push notifications for the given user mailbox. |
| `watch` | Set up or update a push notification watch on the given user mailbox. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/postmaster/reference/rest/v2beta/domains/getComplianceStatus

Send feedback

# Method: domains.getComplianceStatus Stay organized with collections Save and categorize content based on your preferences.

* [HTTP request](#body.HTTP_TEMPLATE)
* [Path parameters](#body.PATH_PARAMETERS)
* [Request body](#body.request_body)
* [Response body](#body.response_body)
  + [JSON representation](#body.DomainComplianceStatus.SCHEMA_REPRESENTATION)
* [Authorization scopes](#body.aspect)
* [DomainComplianceData](#DomainComplianceData)
  + [JSON representation](#DomainComplianceData.SCHEMA_REPRESENTATION)
* [ComplianceRowData](#ComplianceRowData)
  + [JSON representation](#ComplianceRowData.SCHEMA_REPRESENTATION)
* [ComplianceRequirement](#ComplianceRequirement)
* [ComplianceStatus](#ComplianceStatus)
  + [JSON representation](#ComplianceStatus.SCHEMA_REPRESENTATION)
* [State](#State)
* [OneClickUnsubscribeVerdict](#OneClickUnsubscribeVerdict)
  + [JSON representation](#OneClickUnsubscribeVerdict.SCHEMA_REPRESENTATION)
* [Reason](#Reason)
* [HonorUnsubscribeVerdict](#HonorUnsubscribeVerdict)
  + [JSON representation](#HonorUnsubscribeVerdict.SCHEMA_REPRESENTATION)
* [Reason](#Reason_1)

**Developer Preview:** Available as part of the [Google Workspace Developer Preview Program](https://developers.google.com/workspace/preview), which grants early access to certain features. Retrieves the compliance status for a given domain. Returns PERMISSION\_DENIED if you don't have permission to access compliance status for the domain.

### HTTP request

`GET https://gmailpostmastertools.googleapis.com/v2beta/{name=domains/*/complianceStatus}`

The URL uses [gRPC Transcoding](https://google.aip.dev/127) syntax.

### Path parameters

| Parameters | |
| --- | --- |
| `name` | `string`  Required. The resource name of the domain's compliance status to retrieve. Format: `domains/{domainId}/complianceStatus`. |

### Request body

The request body must be empty.

### Response body

Compliance status for a domain.

**Developer Preview:** Available as part of the [Google Workspace Developer Preview Program](https://developers.google.com/workspace/preview), which grants early access to certain features.

If successful, the response body contains data with the following structure:

| JSON representation |
| --- |
| ``` {   "name": string,   "complianceData": {     object (DomainComplianceData)   },   "subdomainComplianceData": {     object (DomainComplianceData)   } } ``` |

| Fields | |
| --- | --- |
| `name` | `string`  Identifier. The resource name of the domain's compliance status. Format: `domains/{domainId}/complianceStatus`. |
| `complianceData` | `object (DomainComplianceData)`  Compliance data for the registrable domain part of the domain in `name`. For example, if `name` is `domains/example.com/complianceStatus`, this field contains compliance data for `example.com`. |
| `subdomainComplianceData` | `object (DomainComplianceData)`  Compliance data calculated specifically for the subdomain in `name`. This field is only populated if the domain in `name` is a subdomain that differs from its registrable domain (e.g., `sub.example.com`), and if compliance data is available for that specific subdomain. |

### Authorization scopes

Requires one of the following OAuth scopes:

* `https://www.googleapis.com/auth/postmaster`
* `https://www.googleapis.com/auth/postmaster.traffic.readonly`

For more information, see the [Authorization guide](https://developers.google.com/workspace/guides/configure-oauth-consent).

## DomainComplianceData

Compliance data for a given domain.

| JSON representation |
| --- |
| ``` {   "domainId": string,   "rowData": [     {       object (ComplianceRowData)     }   ],   "oneClickUnsubscribeVerdict": {     object (OneClickUnsubscribeVerdict)   },   "honorUnsubscribeVerdict": {     object (HonorUnsubscribeVerdict)   } } ``` |

| Fields | |
| --- | --- |
| `domainId` | `string`  Domain that this data is for. |
| `rowData[]` | `object (ComplianceRowData)`  Data for each of the rows of the table. Each message contains all the data that backs a single row. |
| `oneClickUnsubscribeVerdict` | `object (OneClickUnsubscribeVerdict)`  One-click unsubscribe compliance verdict. |
| `honorUnsubscribeVerdict` | `object (HonorUnsubscribeVerdict)`  Unsubscribe honoring compliance verdict. |

## ComplianceRowData

Data for a single row of the compliance status table.

**Developer Preview:** Available as part of the [Google Workspace Developer Preview Program](https://developers.google.com/workspace/preview), which grants early access to certain features.

| JSON representation |
| --- |
| ``` {   "requirement": enum (ComplianceRequirement),   "status": {     object (ComplianceStatus)   } } ``` |

| Fields | |
| --- | --- |
| `requirement` | `enum (ComplianceRequirement)`  The compliance requirement. |
| `status` | `object (ComplianceStatus)`  The compliance status for the requirement. |

## ComplianceRequirement

The compliance requirement.

| Enums | |
| --- | --- |
| `COMPLIANCE_REQUIREMENT_UNSPECIFIED` | Unspecified. |
| `SPF` | Whether the sender has properly configured SPF. |
| `DKIM` | Whether the sender has properly configured DKIM. |
| `SPF_AND_DKIM` | Whether the sender has properly configured both SPF and DKIM. |
| `DMARC_POLICY` | Whether the sender has configured DMARC policy. |
| `DMARC_ALIGNMENT` | Whether the From: header is aligned with DKIM or SPF |
| `MESSAGE_FORMATTING` | Whether messages are correctly formatted according to RFC 5322. |
| `DNS_RECORDS` | Whether the domain has forward and reverse DNS records. |
| `ENCRYPTION` | Whether messages has TLS encryption. |
| `USER_REPORTED_SPAM_RATE` | Whether the sender is below a threshold for user-reported spam rate. |
| `ONE_CLICK_UNSUBSCRIBE` | Whether the sender sufficiently supports one-click unsubscribe. Note that the user-facing requirement is "one-click unsubscribe", but we require satisfaction of multiple "unsubscribe support" rules. |
| `HONOR_UNSUBSCRIBE` | Whether the sender honors user-initiated unsubscribe requests. |

## ComplianceStatus

The status of a sender compliance requirement.

**Developer Preview:** Available as part of the [Google Workspace Developer Preview Program](https://developers.google.com/workspace/preview), which grants early access to certain features.

| JSON representation |
| --- |
| ``` {   "status": enum (State) } ``` |

| Fields | |
| --- | --- |
| `status` | `enum (State)`  Output only. The compliance status. |

## State

The status types for a particular sender compliance requirement.

| Enums | |
| --- | --- |
| `STATE_UNSPECIFIED` | Unspecified. |
| `COMPLIANT` | The compliance requirement is met, and the sender is deemed compliant. |
| `NEEDS_WORK` | The compliance requirement is unmet, and the sender needs to do work to achieve compliance. |

## OneClickUnsubscribeVerdict

Compliance verdict for whether a sender meets the one-click unsubscribe compliance requirement.

**Developer Preview:** Available as part of the [Google Workspace Developer Preview Program](https://developers.google.com/workspace/preview), which grants early access to certain features.

| JSON representation |
| --- |
| ``` {   "status": {     object (ComplianceStatus)   },   "reason": enum (Reason) } ``` |

| Fields | |
| --- | --- |
| `status` | `object (ComplianceStatus)`  The compliance status. |
| `reason` | `enum (Reason)`  The specific reason for the compliance verdict. Must be empty if the status is compliant. |

## Reason

The specific reason a one-click unsubscribe verdict has a "non-compliant" status.

| Enums | |
| --- | --- |
| `REASON_UNSPECIFIED` | Unspecified. |
| `NO_UNSUB_GENERAL` | Sender does not support one-click unsubscribe for the majority of their messages. |
| `NO_UNSUB_SPAM_REPORTS` | Sender does not support one-click unsubscribe for most messages that are manually reported as spam. |
| `NO_UNSUB_PROMO_SPAM_REPORTS` | Sender does not support one-click unsubscribe for most promotional messages that are manually reported as spam. This classification of messages is a subset of those encompassed by `NO_UNSUB_SPAM_REPORTS`. |

## HonorUnsubscribeVerdict

Compliance verdict for whether a sender meets the unsubscribe honoring compliance requirement.

**Developer Preview:** Available as part of the [Google Workspace Developer Preview Program](https://developers.google.com/workspace/preview), which grants early access to certain features.

| JSON representation |
| --- |
| ``` {   "status": {     object (ComplianceStatus)   },   "reason": enum (Reason) } ``` |

| Fields | |
| --- | --- |
| `status` | `object (ComplianceStatus)`  The compliance status. |
| `reason` | `enum (Reason)`  The specific reason for the compliance verdict. Must be empty if the status is compliant. |

## Reason

The specific reason an unsubscribe honoring verdict has a "non-compliant" status.

| Enums | |
| --- | --- |
| `REASON_UNSPECIFIED` | Unspecified. |
| `NOT_HONORING` | The sender does not honor unsubscribe requests. |
| `NOT_HONORING_TOO_FEW_CAMPAIGNS` | The sender does not honor unsubscribe requests and consider to increase the number of relevant campaigns. |
| `NOT_HONORING_TOO_MANY_CAMPAIGNS` | The sender does not honor unsubscribe requests and consider to reduce the number of relevant campaigns. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/Invoice

Send feedback

# Invoice Stay organized with collections Save and categorize content based on your preferences.

Type name: [Invoice](/workspace/gmail/markup/reference/types/Invoice)

Extends [Intangible](/workspace/gmail/markup/reference/types/Intangible)

| Name | Type | Description |
| --- | --- | --- |
| accountId | [Text](/workspace/gmail/markup/reference/types/Text) | The identifier for the account the payment will be applied to. |
| billingPeriod | [Duration](/workspace/gmail/markup/reference/types/Duration) | The time interval used to compute the invoice. |
| broker | [Organization](/workspace/gmail/markup/reference/types/Organization) or [Person](/workspace/gmail/markup/reference/types/Person) | An entity that arranges for an exchange between a buyer and a seller. In most cases a broker never acquires or releases ownership of a product or service involved in an exchange. If it is not clear whether an entity is a broker, seller, or buyer, the latter two terms are preferred. |
| category | [PhysicalActivityCategory](/workspace/gmail/markup/reference/types/PhysicalActivityCategory), [Text](/workspace/gmail/markup/reference/types/Text) or [Thing](/workspace/gmail/markup/reference/types/Thing) | A category for the item. Greater signs or slashes can be used to informally indicate a category hierarchy. |
| confirmationNumber | [Text](/workspace/gmail/markup/reference/types/Text) | A number that confirms the given order or payment has been received. |
| customer | [Organization](/workspace/gmail/markup/reference/types/Organization) or [Person](/workspace/gmail/markup/reference/types/Person) | Party placing the order or paying the invoice. |
| minimumPaymentDue | [PriceSpecification](/workspace/gmail/markup/reference/types/PriceSpecification) | The minimum payment required at this time. |
| paymentDue | [DateTime](/workspace/gmail/markup/reference/types/DateTime) | The date that payment is due. |
| paymentMethod | [PaymentMethod](/workspace/gmail/markup/reference/types/PaymentMethod) | The name of the credit card or other method of payment for the order. |
| paymentMethodId | [Text](/workspace/gmail/markup/reference/types/Text) | An identifier for the method of payment used (e.g. the last 4 digits of the credit card). |
| paymentStatus | [Text](/workspace/gmail/markup/reference/types/Text) | The status of payment; whether the invoice has been paid or not. |
| provider | [Organization](/workspace/gmail/markup/reference/types/Organization) or [Person](/workspace/gmail/markup/reference/types/Person) | The organization providing the reservation. |
| referencesOrder | [Order](/workspace/gmail/markup/reference/types/Order) | The Order(s) related to this Invoice. One or more Orders may be combined into a single Invoice. |
| scheduledPaymentDate | [Date](/workspace/gmail/markup/reference/types/Date) | The date the invoice is scheduled to be paid. |
| totalPaymentDue | [PriceSpecification](/workspace/gmail/markup/reference/types/PriceSpecification) | The total amount due. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/DataType

Send feedback

# DataType Stay organized with collections Save and categorize content based on your preferences.

Type name: [DataType](/workspace/gmail/markup/reference/types/DataType)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/DateTime

Send feedback

# DateTime Stay organized with collections Save and categorize content based on your preferences.

Type name: [DateTime](/workspace/gmail/markup/reference/types/DateTime)

Extends [DataType](/workspace/gmail/markup/reference/types/DataType)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/TravelAction

Send feedback

# TravelAction Stay organized with collections Save and categorize content based on your preferences.

Type name: [TravelAction](/workspace/gmail/markup/reference/types/TravelAction)

Extends [MoveAction](/workspace/gmail/markup/reference/types/MoveAction)

| Name | Type | Description |
| --- | --- | --- |
| distance | [Distance](/workspace/gmail/markup/reference/types/Distance) | The distance travelled, e.g. exercising or travelling. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.labels

Send feedback

# REST Resource: users.labels Stay organized with collections Save and categorize content based on your preferences.

* [Resource: Label](#Label)
  + [JSON representation](#Label.SCHEMA_REPRESENTATION)
* [MessageListVisibility](#MessageListVisibility)
* [LabelListVisibility](#LabelListVisibility)
* [Type](#Type)
* [Color](#Color)
  + [JSON representation](#Color.SCHEMA_REPRESENTATION)
* [Methods](#METHODS_SUMMARY)

## Resource: Label

Labels are used to categorize messages and threads within the user's mailbox. The maximum number of labels supported for a user's mailbox is 10,000.

| JSON representation |
| --- |
| ``` {   "id": string,   "name": string,   "messageListVisibility": enum (MessageListVisibility),   "labelListVisibility": enum (LabelListVisibility),   "type": enum (Type),   "messagesTotal": integer,   "messagesUnread": integer,   "threadsTotal": integer,   "threadsUnread": integer,   "color": {     object (Color)   } } ``` |

| Fields | |
| --- | --- |
| `id` | `string`  The immutable ID of the label. |
| `name` | `string`  The display name of the label. |
| `messageListVisibility` | `enum (MessageListVisibility)`  The visibility of messages with this label in the message list in the Gmail web interface. |
| `labelListVisibility` | `enum (LabelListVisibility)`  The visibility of the label in the label list in the Gmail web interface. |
| `type` | `enum (Type)`  The owner type for the label. User labels are created by the user and can be modified and deleted by the user and can be applied to any message or thread. System labels are internally created and cannot be added, modified, or deleted. System labels may be able to be applied to or removed from messages and threads under some circumstances but this is not guaranteed. For example, users can apply and remove the `INBOX` and `UNREAD` labels from messages and threads, but cannot apply or remove the `DRAFTS` or `SENT` labels from messages or threads. |
| `messagesTotal` | `integer`  The total number of messages with the label. |
| `messagesUnread` | `integer`  The number of unread messages with the label. |
| `threadsTotal` | `integer`  The total number of threads with the label. |
| `threadsUnread` | `integer`  The number of unread threads with the label. |
| `color` | `object (Color)`  The color to assign to the label. Color is only available for labels that have their `type` set to `user`. |

## MessageListVisibility

| Enums | |
| --- | --- |
| `show` | Show the label in the message list. |
| `hide` | Do not show the label in the message list. |

## LabelListVisibility

| Enums | |
| --- | --- |
| `labelShow` | Show the label in the label list. |
| `labelShowIfUnread` | Show the label if there are any unread messages with that label. |
| `labelHide` | Do not show the label in the label list. |

## Type

| Enums | |
| --- | --- |
| `system` | Labels created by Gmail. |
| `user` | Custom labels created by the user or application. |

## Color

| JSON representation |
| --- |
| ``` {   "textColor": string,   "backgroundColor": string } ``` |

| Fields | |
| --- | --- |
| `textColor` | `string`  The text color of the label, represented as hex string. This field is required in order to set the color of a label. Only the following predefined set of color values are allowed:   #000000, #434343, #666666, #999999, #cccccc, #efefef, #f3f3f3, #ffffff, #fb4c2f, #ffad47, #fad165, #16a766, #43d692, #4a86e8, #a479e2, #f691b3, #f6c5be, #ffe6c7, #fef1d1, #b9e4d0, #c6f3de, #c9daf8, #e4d7f5, #fcdee8, #efa093, #ffd6a2, #fce8b3, #89d3b2, #a0eac9, #a4c2f4, #d0bcf1, #fbc8d9, #e66550, #ffbc6b, #fcda83, #44b984, #68dfa9, #6d9eeb, #b694e8, #f7a7c0, #cc3a21, #eaa041, #f2c960, #149e60, #3dc789, #3c78d8, #8e63ce, #e07798, #ac2b16, #cf8933, #d5ae49, #0b804b, #2a9c68, #285bac, #653e9b, #b65775, #822111, #a46a21, #aa8831, #076239, #1a764d, #1c4587, #41236d, #83334c #464646, #e7e7e7, #0d3472, #b6cff5, #0d3b44, #98d7e4, #3d188e, #e3d7ff, #711a36, #fbd3e0, #8a1c0a, #f2b2a8, #7a2e0b, #ffc8af, #7a4706, #ffdeb5, #594c05, #fbe983, #684e07, #fdedc1, #0b4f30, #b3efd3, #04502e, #a2dcc1, #c2c2c2, #4986e7, #2da2bb, #b99aff, #994a64, #f691b2, #ff7537, #ffad46, #662e37, #ebdbde, #cca6ac, #094228, #42d692, #16a765 |
| `backgroundColor` | `string`  The background color represented as hex string #RRGGBB (ex #000000). This field is required in order to set the color of a label. Only the following predefined set of color values are allowed:   #000000, #434343, #666666, #999999, #cccccc, #efefef, #f3f3f3, #ffffff, #fb4c2f, #ffad47, #fad165, #16a766, #43d692, #4a86e8, #a479e2, #f691b3, #f6c5be, #ffe6c7, #fef1d1, #b9e4d0, #c6f3de, #c9daf8, #e4d7f5, #fcdee8, #efa093, #ffd6a2, #fce8b3, #89d3b2, #a0eac9, #a4c2f4, #d0bcf1, #fbc8d9, #e66550, #ffbc6b, #fcda83, #44b984, #68dfa9, #6d9eeb, #b694e8, #f7a7c0, #cc3a21, #eaa041, #f2c960, #149e60, #3dc789, #3c78d8, #8e63ce, #e07798, #ac2b16, #cf8933, #d5ae49, #0b804b, #2a9c68, #285bac, #653e9b, #b65775, #822111, #a46a21, #aa8831, #076239, #1a764d, #1c4587, #41236d, #83334c #464646, #e7e7e7, #0d3472, #b6cff5, #0d3b44, #98d7e4, #3d188e, #e3d7ff, #711a36, #fbd3e0, #8a1c0a, #f2b2a8, #7a2e0b, #ffc8af, #7a4706, #ffdeb5, #594c05, #fbe983, #684e07, #fdedc1, #0b4f30, #b3efd3, #04502e, #a2dcc1, #c2c2c2, #4986e7, #2da2bb, #b99aff, #994a64, #f691b2, #ff7537, #ffad46, #662e37, #ebdbde, #cca6ac, #094228, #42d692, #16a765 |

| Methods | |
| --- | --- |
| `create` | Creates a new label. |
| `delete` | Immediately and permanently deletes the specified label and removes it from any messages and threads that it is applied to. |
| `get` | Gets the specified label. |
| `list` | Lists all labels in the user's mailbox. |
| `patch` | Patch the specified label. |
| `update` | Updates the specified label. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/QualitativeValue

Send feedback

# QualitativeValue Stay organized with collections Save and categorize content based on your preferences.

Type name: [QualitativeValue](/workspace/gmail/markup/reference/types/QualitativeValue)

Extends [Enumeration](/workspace/gmail/markup/reference/types/Enumeration)

| Name | Type | Description |
| --- | --- | --- |
| equal | [QualitativeValue](/workspace/gmail/markup/reference/types/QualitativeValue) | This ordering relation for qualitative values indicates that the subject is equal to the object. |
| greater | [QualitativeValue](/workspace/gmail/markup/reference/types/QualitativeValue) | This ordering relation for qualitative values indicates that the subject is greater than the object. |
| greaterOrEqual | [QualitativeValue](/workspace/gmail/markup/reference/types/QualitativeValue) | This ordering relation for qualitative values indicates that the subject is greater than or equal to the object. |
| lesser | [QualitativeValue](/workspace/gmail/markup/reference/types/QualitativeValue) | This ordering relation for qualitative values indicates that the subject is lesser than the object. |
| lesserOrEqual | [QualitativeValue](/workspace/gmail/markup/reference/types/QualitativeValue) | This ordering relation for qualitative values indicates that the subject is lesser than or equal to the object. |
| nonEqual | [QualitativeValue](/workspace/gmail/markup/reference/types/QualitativeValue) | This ordering relation for qualitative values indicates that the subject is not equal to the object. |
| valueReference | [Enumeration](/workspace/gmail/markup/reference/types/Enumeration) or [StructuredValue](/workspace/gmail/markup/reference/types/StructuredValue) | A pointer to a secondary value that provides additional information on the original value, e.g. a reference temperature. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/ItemPage

Send feedback

# ItemPage Stay organized with collections Save and categorize content based on your preferences.

Type name: [ItemPage](/workspace/gmail/markup/reference/types/ItemPage)

Extends [WebPage](/workspace/gmail/markup/reference/types/WebPage)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.threads/untrash

Send feedback

# Method: users.threads.untrash Stay organized with collections Save and categorize content based on your preferences.

* [HTTP request](#body.HTTP_TEMPLATE)
* [Path parameters](#body.PATH_PARAMETERS)
* [Request body](#body.request_body)
* [Response body](#body.response_body)
* [Authorization scopes](#body.aspect)
* [Try it!](#try-it)

Removes the specified thread from the trash. Any messages that belong to the thread are also removed from the trash.

### HTTP request

`POST https://gmail.googleapis.com/gmail/v1/users/{userId}/threads/{id}/untrash`

The URL uses [gRPC Transcoding](https://google.aip.dev/127) syntax.

### Path parameters

| Parameters | |
| --- | --- |
| `userId` | `string`  The user's email address. The special value `me` can be used to indicate the authenticated user. |
| `id` | `string`  The ID of the thread to remove from Trash. |

### Request body

The request body must be empty.

### Response body

If successful, the response body contains an instance of `Thread`.

### Authorization scopes

Requires one of the following OAuth scopes:

* `https://mail.google.com/`
* `https://www.googleapis.com/auth/gmail.modify`

For more information, see the [OAuth 2.0 Overview](/identity/protocols/OAuth2).




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/ItemList

Send feedback

# ItemList Stay organized with collections Save and categorize content based on your preferences.

Type name: [ItemList](/workspace/gmail/markup/reference/types/ItemList)

Extends [Intangible](/workspace/gmail/markup/reference/types/Intangible)

| Name | Type | Description |
| --- | --- | --- |
| itemListElement | [ListItem](/workspace/gmail/markup/reference/types/ListItem), [Text](/workspace/gmail/markup/reference/types/Text) or [Thing](/workspace/gmail/markup/reference/types/Thing) | For itemListElement values, you can use simple strings (e.g. "Peter", "Paul", "Mary"), existing entities, or use ListItem.  Text values are best if the elements in the list are plain strings. Existing entities are best for a simple, unordered list of existing things in your data. ListItem is used with ordered lists when you want to provide additional context about the element in that list or when the same item might be in different places in different lists.  Note: The order of elements in your mark-up is not sufficient for indicating the order or elements. Use ListItem with a 'position' property in such cases. |
| itemListOrder | [ItemListOrderType](/workspace/gmail/markup/reference/types/ItemListOrderType) or [Text](/workspace/gmail/markup/reference/types/Text) | Type of ordering (e.g. Ascending, Descending, Unordered). |
| numberOfItems | [Number](/workspace/gmail/markup/reference/types/Number) | The number of items in an ItemList. Note that some descriptions might not full describe all items in a list (e.g. multi-page pagination). |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/RealEstateAgent

Send feedback

# RealEstateAgent Stay organized with collections Save and categorize content based on your preferences.

Type name: [RealEstateAgent](/workspace/gmail/markup/reference/types/RealEstateAgent)

Extends [LocalBusiness](/workspace/gmail/markup/reference/types/LocalBusiness)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/Campground

Send feedback

# Campground Stay organized with collections Save and categorize content based on your preferences.

Type name: [Campground](/workspace/gmail/markup/reference/types/Campground)

Extends [CivicStructure](/workspace/gmail/markup/reference/types/CivicStructure)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/SingleFamilyResidence

Send feedback

# SingleFamilyResidence Stay organized with collections Save and categorize content based on your preferences.

Type name: [SingleFamilyResidence](/workspace/gmail/markup/reference/types/SingleFamilyResidence)

Extends [Residence](/workspace/gmail/markup/reference/types/Residence)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/postmaster/reference/rest/v2beta/Date

Send feedback

# Date Stay organized with collections Save and categorize content based on your preferences.

* [JSON representation](#SCHEMA_REPRESENTATION)

Represents a whole or partial calendar date, such as a birthday. The time of day and time zone are either specified elsewhere or are insignificant. The date is relative to the Gregorian Calendar. This can represent one of the following:

* A full date, with non-zero year, month, and day values.
* A month and day, with a zero year (for example, an anniversary).
* A year on its own, with a zero month and a zero day.
* A year and month, with a zero day (for example, a credit card expiration date).

Related types:

* `google.type.TimeOfDay`
* `google.type.DateTime`
* `google.protobuf.Timestamp`

| JSON representation |
| --- |
| ``` {   "year": integer,   "month": integer,   "day": integer } ``` |

| Fields | |
| --- | --- |
| `year` | `integer`  Year of the date. Must be from 1 to 9999, or 0 to specify a date without a year. |
| `month` | `integer`  Month of a year. Must be from 1 to 12, or 0 to specify a year without a month and day. |
| `day` | `integer`  Day of a month. Must be from 1 to 31 and valid for the year and month, or 0 to specify a year by itself or a year and month where the day isn't significant. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/HomeAndConstructionBusiness

Send feedback

# HomeAndConstructionBusiness Stay organized with collections Save and categorize content based on your preferences.

Type name: [HomeAndConstructionBusiness](/workspace/gmail/markup/reference/types/HomeAndConstructionBusiness)

Extends [LocalBusiness](/workspace/gmail/markup/reference/types/LocalBusiness)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/api/reference/rest/v1/AutoForwarding

Send feedback

# AutoForwarding Stay organized with collections Save and categorize content based on your preferences.

* [JSON representation](#SCHEMA_REPRESENTATION)
* [Disposition](#Disposition)

Auto-forwarding settings for an account.

| JSON representation |
| --- |
| ``` {   "enabled": boolean,   "emailAddress": string,   "disposition": enum (Disposition) } ``` |

| Fields | |
| --- | --- |
| `enabled` | `boolean`  Whether all incoming mail is automatically forwarded to another address. |
| `emailAddress` | `string`  Email address to which all incoming messages are forwarded. This email address must be a verified member of the forwarding addresses. |
| `disposition` | `enum (Disposition)`  The state that a message should be left in after it has been forwarded. |

## Disposition

Specifies what Gmail should do with a message after it has been automatically forwarded.

| Enums | |
| --- | --- |
| `dispositionUnspecified` | Unspecified disposition. |
| `leaveInInbox` | Leave the message in the `INBOX`. |
| `archive` | Archive the message. |
| `trash` | Move the message to the `TRASH`. |
| `markRead` | Leave the message in the `INBOX` and mark it as read. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/FindAction

Send feedback

# FindAction Stay organized with collections Save and categorize content based on your preferences.

Type name: [FindAction](/workspace/gmail/markup/reference/types/FindAction)

Extends [Action](/workspace/gmail/markup/reference/types/Action)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/Zoo

Send feedback

# Zoo Stay organized with collections Save and categorize content based on your preferences.

Type name: [Zoo](/workspace/gmail/markup/reference/types/Zoo)

Extends [CivicStructure](/workspace/gmail/markup/reference/types/CivicStructure)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/DiagnosticLab

Send feedback

# DiagnosticLab Stay organized with collections Save and categorize content based on your preferences.

Type name: [DiagnosticLab](/workspace/gmail/markup/reference/types/DiagnosticLab)

Extends [MedicalOrganization](/workspace/gmail/markup/reference/types/MedicalOrganization)

| Name | Type | Description |
| --- | --- | --- |
| availableTest | [MedicalTest](/workspace/gmail/markup/reference/types/MedicalTest) | A diagnostic test or procedure offered by this lab. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/MedicalCondition

Send feedback

# MedicalCondition Stay organized with collections Save and categorize content based on your preferences.

Type name: [MedicalCondition](/workspace/gmail/markup/reference/types/MedicalCondition)

Extends [MedicalEntity](/workspace/gmail/markup/reference/types/MedicalEntity)

| Name | Type | Description |
| --- | --- | --- |
| associatedAnatomy | [AnatomicalStructure](/workspace/gmail/markup/reference/types/AnatomicalStructure), [AnatomicalSystem](/workspace/gmail/markup/reference/types/AnatomicalSystem) or [SuperficialAnatomy](/workspace/gmail/markup/reference/types/SuperficialAnatomy) | The anatomy of the underlying organ system or structures associated with this entity. |
| cause | [MedicalCause](/workspace/gmail/markup/reference/types/MedicalCause) | An underlying cause. More specifically, one of the causative agent(s) that are most directly responsible for the pathophysiologic process that eventually results in the occurrence. |
| differentialDiagnosis | [DDxElement](/workspace/gmail/markup/reference/types/DDxElement) | One of a set of differential diagnoses for the condition. Specifically, a closely-related or competing diagnosis typically considered later in the cognitive process whereby this medical condition is distinguished from others most likely responsible for a similar collection of signs and symptoms to reach the most parsimonious diagnosis or diagnoses in a patient. |
| epidemiology | [Text](/workspace/gmail/markup/reference/types/Text) | The characteristics of associated patients, such as age, gender, race etc. |
| expectedPrognosis | [Text](/workspace/gmail/markup/reference/types/Text) | The likely outcome in either the short term or long term of the medical condition. |
| naturalProgression | [Text](/workspace/gmail/markup/reference/types/Text) | The expected progression of the condition if it is not treated and allowed to progress naturally. |
| pathophysiology | [Text](/workspace/gmail/markup/reference/types/Text) | Changes in the normal mechanical, physical, and biochemical functions that are associated with this activity or condition. |
| possibleComplication | [Text](/workspace/gmail/markup/reference/types/Text) | A possible unexpected and unfavorable evolution of a medical condition. Complications may include worsening of the signs or symptoms of the disease, extension of the condition to other organ systems, etc. |
| possibleTreatment | [MedicalTherapy](/workspace/gmail/markup/reference/types/MedicalTherapy) | A possible treatment to address this condition, sign or symptom. |
| primaryPrevention | [MedicalTherapy](/workspace/gmail/markup/reference/types/MedicalTherapy) | A preventative therapy used to prevent an initial occurrence of the medical condition, such as vaccination. |
| riskFactor | [MedicalRiskFactor](/workspace/gmail/markup/reference/types/MedicalRiskFactor) | A modifiable or non-modifiable factor that increases the risk of a patient contracting this condition, e.g. age, coexisting condition. |
| secondaryPrevention | [MedicalTherapy](/workspace/gmail/markup/reference/types/MedicalTherapy) | A preventative therapy used to prevent reoccurrence of the medical condition after an initial episode of the condition. |
| signOrSymptom | [MedicalSignOrSymptom](/workspace/gmail/markup/reference/types/MedicalSignOrSymptom) | A sign or symptom of this condition. Signs are objective or physically observable manifestations of the medical condition while symptoms are the subjective experience of the medical condition. |
| stage | [MedicalConditionStage](/workspace/gmail/markup/reference/types/MedicalConditionStage) | The stage of the condition, if applicable. |
| subtype | [Text](/workspace/gmail/markup/reference/types/Text) | A more specific type of the condition, where applicable, for example 'Type 1 Diabetes', 'Type 2 Diabetes', or 'Gestational Diabetes' for Diabetes. |
| typicalTest | [MedicalTest](/workspace/gmail/markup/reference/types/MedicalTest) | A medical test typically performed given this condition. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/PoliceStation

Send feedback

# PoliceStation Stay organized with collections Save and categorize content based on your preferences.

Type name: [PoliceStation](/workspace/gmail/markup/reference/types/PoliceStation)

Extends [CivicStructure](/workspace/gmail/markup/reference/types/CivicStructure) or [EmergencyService](/workspace/gmail/markup/reference/types/EmergencyService)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/MedicalRiskEstimator

Send feedback

# MedicalRiskEstimator Stay organized with collections Save and categorize content based on your preferences.

Type name: [MedicalRiskEstimator](/workspace/gmail/markup/reference/types/MedicalRiskEstimator)

Extends [MedicalEntity](/workspace/gmail/markup/reference/types/MedicalEntity)

| Name | Type | Description |
| --- | --- | --- |
| estimatesRiskOf | [MedicalEntity](/workspace/gmail/markup/reference/types/MedicalEntity) | The condition, complication, or symptom whose risk is being estimated. |
| includedRiskFactor | [MedicalRiskFactor](/workspace/gmail/markup/reference/types/MedicalRiskFactor) | A modifiable or non-modifiable risk factor included in the calculation, e.g. age, coexisting condition. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/StructuredValue

Send feedback

# StructuredValue Stay organized with collections Save and categorize content based on your preferences.

Type name: [StructuredValue](/workspace/gmail/markup/reference/types/StructuredValue)

Extends [Intangible](/workspace/gmail/markup/reference/types/Intangible)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.drafts/create

Send feedback

# Method: users.drafts.create Stay organized with collections Save and categorize content based on your preferences.

* [HTTP request](#body.HTTP_TEMPLATE)
* [Path parameters](#body.PATH_PARAMETERS)
* [Request body](#body.request_body)
* [Response body](#body.response_body)
* [Authorization scopes](#body.aspect)
* [Try it!](#try-it)

Creates a new draft with the `DRAFT` label.

### HTTP request

* Upload URI, for media upload requests:  
  `POST https://gmail.googleapis.com/upload/gmail/v1/users/{userId}/drafts`
* Metadata URI, for metadata-only requests:  
  `POST https://gmail.googleapis.com/gmail/v1/users/{userId}/drafts`

The URL uses [gRPC Transcoding](https://google.aip.dev/127) syntax.

### Path parameters

| Parameters | |
| --- | --- |
| `userId` | `string`  The user's email address. The special value `me` can be used to indicate the authenticated user. |

### Request body

The request body contains an instance of `Draft`.

### Response body

If successful, the response body contains an instance of `Draft`.

### Authorization scopes

Requires one of the following OAuth scopes:

* `https://mail.google.com/`
* `https://www.googleapis.com/auth/gmail.modify`
* `https://www.googleapis.com/auth/gmail.compose`
* `https://www.googleapis.com/auth/gmail.addons.current.action.compose`

For more information, see the [OAuth 2.0 Overview](/identity/protocols/OAuth2).




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.settings.cse.identities/delete

Send feedback

# Method: users.settings.cse.identities.delete Stay organized with collections Save and categorize content based on your preferences.

* [HTTP request](#body.HTTP_TEMPLATE)
* [Path parameters](#body.PATH_PARAMETERS)
* [Request body](#body.request_body)
* [Response body](#body.response_body)
* [Authorization scopes](#body.aspect)
* [Try it!](#try-it)

Deletes a client-side encryption identity. The authenticated user can no longer use the identity to send encrypted messages.

You cannot restore the identity after you delete it. Instead, use the `identities.create` method to create another identity with the same configuration.

For administrators managing identities and keypairs for users in their organization, requests require authorization with a [service account](https://developers.google.com/identity/protocols/OAuth2ServiceAccount) that has [domain-wide delegation authority](https://developers.google.com/identity/protocols/OAuth2ServiceAccount#delegatingauthority) to impersonate users with the `https://www.googleapis.com/auth/gmail.settings.basic` scope.

For users managing their own identities and keypairs, requests require [hardware key encryption](https://support.google.com/a/answer/14153163) turned on and configured.

### HTTP request

`DELETE https://gmail.googleapis.com/gmail/v1/users/{userId}/settings/cse/identities/{cseEmailAddress}`

The URL uses [gRPC Transcoding](https://google.aip.dev/127) syntax.

### Path parameters

| Parameters | |
| --- | --- |
| `userId` | `string`  The requester's primary email address. To indicate the authenticated user, you can use the special value `me`. |
| `cseEmailAddress` | `string`  The primary email address associated with the client-side encryption identity configuration that's removed. |

### Request body

The request body must be empty.

### Response body

If successful, the response body is an empty JSON object.

### Authorization scopes

Requires one of the following OAuth scopes:

* `https://www.googleapis.com/auth/gmail.settings.basic`
* `https://www.googleapis.com/auth/gmail.settings.sharing`

For more information, see the [OAuth 2.0 Overview](/identity/protocols/OAuth2).




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/EntertainmentBusiness

Send feedback

# EntertainmentBusiness Stay organized with collections Save and categorize content based on your preferences.

Type name: [EntertainmentBusiness](/workspace/gmail/markup/reference/types/EntertainmentBusiness)

Extends [LocalBusiness](/workspace/gmail/markup/reference/types/LocalBusiness)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.settings.cse.keypairs/get

Send feedback

# Method: users.settings.cse.keypairs.get Stay organized with collections Save and categorize content based on your preferences.

* [HTTP request](#body.HTTP_TEMPLATE)
* [Path parameters](#body.PATH_PARAMETERS)
* [Request body](#body.request_body)
* [Response body](#body.response_body)
* [Authorization scopes](#body.aspect)
* [Try it!](#try-it)

Retrieves an existing client-side encryption key pair.

For administrators managing identities and keypairs for users in their organization, requests require authorization with a [service account](https://developers.google.com/identity/protocols/OAuth2ServiceAccount) that has [domain-wide delegation authority](https://developers.google.com/identity/protocols/OAuth2ServiceAccount#delegatingauthority) to impersonate users with the `https://www.googleapis.com/auth/gmail.settings.basic` scope.

For users managing their own identities and keypairs, requests require [hardware key encryption](https://support.google.com/a/answer/14153163) turned on and configured.

### HTTP request

`GET https://gmail.googleapis.com/gmail/v1/users/{userId}/settings/cse/keypairs/{keyPairId}`

The URL uses [gRPC Transcoding](https://google.aip.dev/127) syntax.

### Path parameters

| Parameters | |
| --- | --- |
| `userId` | `string`  The requester's primary email address. To indicate the authenticated user, you can use the special value `me`. |
| `keyPairId` | `string`  The identifier of the key pair to retrieve. |

### Request body

The request body must be empty.

### Response body

If successful, the response body contains an instance of `CseKeyPair`.

### Authorization scopes

Requires one of the following OAuth scopes:

* `https://www.googleapis.com/auth/gmail.settings.basic`
* `https://mail.google.com/`
* `https://www.googleapis.com/auth/gmail.modify`
* `https://www.googleapis.com/auth/gmail.readonly`
* `https://www.googleapis.com/auth/gmail.settings.sharing`

For more information, see the [OAuth 2.0 Overview](/identity/protocols/OAuth2).




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/JewelryStore

Send feedback

# JewelryStore Stay organized with collections Save and categorize content based on your preferences.

Type name: [JewelryStore](/workspace/gmail/markup/reference/types/JewelryStore)

Extends [Store](/workspace/gmail/markup/reference/types/Store)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/TechArticle

Send feedback

# TechArticle Stay organized with collections Save and categorize content based on your preferences.

Type name: [TechArticle](/workspace/gmail/markup/reference/types/TechArticle)

Extends [Article](/workspace/gmail/markup/reference/types/Article)

| Name | Type | Description |
| --- | --- | --- |
| dependencies | [Text](/workspace/gmail/markup/reference/types/Text) | Prerequisites needed to fulfill steps in article. |
| proficiencyLevel | [Text](/workspace/gmail/markup/reference/types/Text) | Proficiency needed for this content; expected values: 'Beginner', 'Expert'. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/api/troubleshoot-authentication-authorization

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
# https://developers.google.com/workspace/gmail/markup/reference/types/Product

Send feedback

# Product Stay organized with collections Save and categorize content based on your preferences.

Type name: [Product](/workspace/gmail/markup/reference/types/Product)

Extends [Thing](/workspace/gmail/markup/reference/types/Thing)

| Name | Type | Description |
| --- | --- | --- |
| aggregateRating | [AggregateRating](/workspace/gmail/markup/reference/types/AggregateRating) | The overall rating, based on a collection of reviews or ratings, of the item. |
| audience | [Audience](/workspace/gmail/markup/reference/types/Audience) | The intended audience of the item, i.e. the group for whom the item was created. |
| brand | [Brand](/workspace/gmail/markup/reference/types/Brand) or [Organization](/workspace/gmail/markup/reference/types/Organization) | The brand(s) associated with a product or service, or the brand(s) maintained by an organization or business person. |
| color | [Text](/workspace/gmail/markup/reference/types/Text) | The color of the product. |
| depth | [Distance](/workspace/gmail/markup/reference/types/Distance) or [QuantitativeValue](/workspace/gmail/markup/reference/types/QuantitativeValue) | The depth of the item. |
| gtin13 | [Text](/workspace/gmail/markup/reference/types/Text) | The [GTIN-13](http://apps.gs1.org/GDD/glossary/Pages/GTIN-13.aspx) code of the product, or the product to which the offer refers. This is equivalent to 13-digit ISBN codes and EAN UCC-13. Former 12-digit UPC codes can be converted into a GTIN-13 code by simply adding a preceeding zero. See [GS1 GTIN Summary](http://www.gs1.org/barcodes/technical/idkeys/gtin) for more details. |
| gtin14 | [Text](/workspace/gmail/markup/reference/types/Text) | The [GTIN-14](http://apps.gs1.org/GDD/glossary/Pages/GTIN-14.aspx) code of the product, or the product to which the offer refers. See [GS1 GTIN Summary](http://www.gs1.org/barcodes/technical/idkeys/gtin) for more details. |
| gtin8 | [Text](/workspace/gmail/markup/reference/types/Text) | The [GTIN-8](http://apps.gs1.org/GDD/glossary/Pages/GTIN-8.aspx) code of the product, or the product to which the offer refers. This code is also known as EAN/UCC-8 or 8-digit EAN. See [GS1 GTIN Summary](http://www.gs1.org/barcodes/technical/idkeys/gtin) for more details. |
| height | [Distance](/workspace/gmail/markup/reference/types/Distance) or [QuantitativeValue](/workspace/gmail/markup/reference/types/QuantitativeValue) | The height of the item. |
| isAccessoryOrSparePartFor | [Product](/workspace/gmail/markup/reference/types/Product) | A pointer to another product (or multiple products) for which this product is an accessory or spare part. |
| isConsumableFor | [Product](/workspace/gmail/markup/reference/types/Product) | A pointer to another product (or multiple products) for which this product is a consumable. |
| isRelatedTo | [Product](/workspace/gmail/markup/reference/types/Product) | A pointer to another, somehow related product (or multiple products). |
| isSimilarTo | [Product](/workspace/gmail/markup/reference/types/Product) | A pointer to another, functionally similar product (or multiple products). |
| itemCondition | [OfferItemCondition](/workspace/gmail/markup/reference/types/OfferItemCondition) | A predefined value from OfferItemCondition or a textual description of the condition of the product or service, or the products or services included in the offer. |
| logo | [ImageObject](/workspace/gmail/markup/reference/types/ImageObject) or [URL](/workspace/gmail/markup/reference/types/URL) | An associated logo. |
| manufacturer | [Organization](/workspace/gmail/markup/reference/types/Organization) | The manufacturer of the product. |
| model | [ProductModel](/workspace/gmail/markup/reference/types/ProductModel) or [Text](/workspace/gmail/markup/reference/types/Text) | The model of the product. Use with the URL of a ProductModel or a textual representation of the model identifier. The URL of the ProductModel can be from an external source. It is recommended to additionally provide strong product identifiers via the gtin8/gtin13/gtin14 and mpn properties. |
| mpn | [Text](/workspace/gmail/markup/reference/types/Text) | The Manufacturer Part Number (MPN) of the product, or the product to which the offer refers. |
| offers | [Offer](/workspace/gmail/markup/reference/types/Offer) | An offer to provide this item—for example, an offer to sell a product, rent the DVD of a movie, or give away tickets to an event. |
| productID | [Text](/workspace/gmail/markup/reference/types/Text) | The product identifier, such as ISBN. For example: `<meta itemprop='productID' content='isbn:123-456-789'/>`. |
| releaseDate | [Date](/workspace/gmail/markup/reference/types/Date) | The release date of a product or product model. This can be used to distinguish the exact variant of a product. |
| review | [Review](/workspace/gmail/markup/reference/types/Review) | The review. |
| reviews | [Review](/workspace/gmail/markup/reference/types/Review) | Review of the item. |
| sku | [Text](/workspace/gmail/markup/reference/types/Text) | The Stock Keeping Unit (SKU), i.e. a merchant-specific identifier for a product or service, or the product to which the offer refers. |
| weight | [QuantitativeValue](/workspace/gmail/markup/reference/types/QuantitativeValue) | The weight of the product or person. |
| width | [Distance](/workspace/gmail/markup/reference/types/Distance) or [QuantitativeValue](/workspace/gmail/markup/reference/types/QuantitativeValue) | The width of the item. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/SportsClub

Send feedback

# SportsClub Stay organized with collections Save and categorize content based on your preferences.

Type name: [SportsClub](/workspace/gmail/markup/reference/types/SportsClub)

Extends [SportsActivityLocation](/workspace/gmail/markup/reference/types/SportsActivityLocation)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/AutomatedTeller

Send feedback

# AutomatedTeller Stay organized with collections Save and categorize content based on your preferences.

Type name: [AutomatedTeller](/workspace/gmail/markup/reference/types/AutomatedTeller)

Extends [FinancialService](/workspace/gmail/markup/reference/types/FinancialService)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/Duration

Send feedback

# Duration Stay organized with collections Save and categorize content based on your preferences.

Type name: [Duration](/workspace/gmail/markup/reference/types/Duration)

Extends [Quantity](/workspace/gmail/markup/reference/types/Quantity)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/MedicalScholarlyArticle

Send feedback

# MedicalScholarlyArticle Stay organized with collections Save and categorize content based on your preferences.

Type name: [MedicalScholarlyArticle](/workspace/gmail/markup/reference/types/MedicalScholarlyArticle)

Extends [ScholarlyArticle](/workspace/gmail/markup/reference/types/ScholarlyArticle)

| Name | Type | Description |
| --- | --- | --- |
| publicationType | [Text](/workspace/gmail/markup/reference/types/Text) | The type of the medical article, taken from the US NLM MeSH [publication type catalog.](http://www.nlm.nih.gov/mesh/pubtypes.html) |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/ConsumeAction

Send feedback

# ConsumeAction Stay organized with collections Save and categorize content based on your preferences.

Type name: [ConsumeAction](/workspace/gmail/markup/reference/types/ConsumeAction)

Extends [Action](/workspace/gmail/markup/reference/types/Action)

| Name | Type | Description |
| --- | --- | --- |
| expectsAcceptanceOf | [Offer](/workspace/gmail/markup/reference/types/Offer) | An Offer which must be accepted before the user can perform the Action. For example, the user may need to buy a movie before being able to watch it. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/BookmarkAction

Send feedback

# BookmarkAction Stay organized with collections Save and categorize content based on your preferences.

Type name: [BookmarkAction](/workspace/gmail/markup/reference/types/BookmarkAction)

Extends [OrganizeAction](/workspace/gmail/markup/reference/types/OrganizeAction)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/Church

Send feedback

# Church Stay organized with collections Save and categorize content based on your preferences.

Type name: [Church](/workspace/gmail/markup/reference/types/Church)

Extends [PlaceOfWorship](/workspace/gmail/markup/reference/types/PlaceOfWorship)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/FilmAction

Send feedback

# FilmAction Stay organized with collections Save and categorize content based on your preferences.

Type name: [FilmAction](/workspace/gmail/markup/reference/types/FilmAction)

Extends [CreateAction](/workspace/gmail/markup/reference/types/CreateAction)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/TaxiStand

Send feedback

# TaxiStand Stay organized with collections Save and categorize content based on your preferences.

Type name: [TaxiStand](/workspace/gmail/markup/reference/types/TaxiStand)

Extends [CivicStructure](/workspace/gmail/markup/reference/types/CivicStructure)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/EntryPoint

Send feedback

# EntryPoint Stay organized with collections Save and categorize content based on your preferences.

Type name: [EntryPoint](/workspace/gmail/markup/reference/types/EntryPoint)

Extends [Intangible](/workspace/gmail/markup/reference/types/Intangible)

| Name | Type | Description |
| --- | --- | --- |
| application | [SoftwareApplication](/workspace/gmail/markup/reference/types/SoftwareApplication) | An application that can complete the request. |
| contentType | [Text](/workspace/gmail/markup/reference/types/Text) | The supported content type(s) for an EntryPoint response. |
| encodingType | [Text](/workspace/gmail/markup/reference/types/Text) | The supported encoding type(s) for an EntryPoint request. |
| httpMethod | [Text](/workspace/gmail/markup/reference/types/Text) | An HTTP method that specifies the appropriate HTTP method for a request to an HTTP EntryPoint. Values are capitalized strings as used in HTTP. |
| urlTemplate | [Text](/workspace/gmail/markup/reference/types/Text) | An url template (RFC 6570) that will be used to construct the target of the execution of the action. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/RecommendedDoseSchedule

Send feedback

# RecommendedDoseSchedule Stay organized with collections Save and categorize content based on your preferences.

Type name: [RecommendedDoseSchedule](/workspace/gmail/markup/reference/types/RecommendedDoseSchedule)

Extends [DoseSchedule](/workspace/gmail/markup/reference/types/DoseSchedule)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/PetStore

Send feedback

# PetStore Stay organized with collections Save and categorize content based on your preferences.

Type name: [PetStore](/workspace/gmail/markup/reference/types/PetStore)

Extends [Store](/workspace/gmail/markup/reference/types/Store)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/SelfStorage

Send feedback

# SelfStorage Stay organized with collections Save and categorize content based on your preferences.

Type name: [SelfStorage](/workspace/gmail/markup/reference/types/SelfStorage)

Extends [LocalBusiness](/workspace/gmail/markup/reference/types/LocalBusiness)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/GardenStore

Send feedback

# GardenStore Stay organized with collections Save and categorize content based on your preferences.

Type name: [GardenStore](/workspace/gmail/markup/reference/types/GardenStore)

Extends [Store](/workspace/gmail/markup/reference/types/Store)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/MoveAction

Send feedback

# MoveAction Stay organized with collections Save and categorize content based on your preferences.

Type name: [MoveAction](/workspace/gmail/markup/reference/types/MoveAction)

Extends [Action](/workspace/gmail/markup/reference/types/Action)

| Name | Type | Description |
| --- | --- | --- |
| fromLocation | [Place](/workspace/gmail/markup/reference/types/Place) | A sub property of location. The original location of the object or the agent before the action. |
| toLocation | [Place](/workspace/gmail/markup/reference/types/Place) | A sub property of location. The final location of the object or the agent after the action. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.labels/get

Send feedback

# Method: users.labels.get Stay organized with collections Save and categorize content based on your preferences.

* [HTTP request](#body.HTTP_TEMPLATE)
* [Path parameters](#body.PATH_PARAMETERS)
* [Request body](#body.request_body)
* [Response body](#body.response_body)
* [Authorization scopes](#body.aspect)
* [Try it!](#try-it)

Gets the specified label.

### HTTP request

`GET https://gmail.googleapis.com/gmail/v1/users/{userId}/labels/{id}`

The URL uses [gRPC Transcoding](https://google.aip.dev/127) syntax.

### Path parameters

| Parameters | |
| --- | --- |
| `userId` | `string`  The user's email address. The special value `me` can be used to indicate the authenticated user. |
| `id` | `string`  The ID of the label to retrieve. |

### Request body

The request body must be empty.

### Response body

If successful, the response body contains an instance of `Label`.

### Authorization scopes

Requires one of the following OAuth scopes:

* `https://mail.google.com/`
* `https://www.googleapis.com/auth/gmail.modify`
* `https://www.googleapis.com/auth/gmail.readonly`
* `https://www.googleapis.com/auth/gmail.labels`
* `https://www.googleapis.com/auth/gmail.metadata`

For more information, see the [OAuth 2.0 Overview](/identity/protocols/OAuth2).




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/TrainStation

Send feedback

# TrainStation Stay organized with collections Save and categorize content based on your preferences.

Type name: [TrainStation](/workspace/gmail/markup/reference/types/TrainStation)

Extends [CivicStructure](/workspace/gmail/markup/reference/types/CivicStructure)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/PawnShop

Send feedback

# PawnShop Stay organized with collections Save and categorize content based on your preferences.

Type name: [PawnShop](/workspace/gmail/markup/reference/types/PawnShop)

Extends [Store](/workspace/gmail/markup/reference/types/Store)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/State

Send feedback

# State Stay organized with collections Save and categorize content based on your preferences.

Type name: [State](/workspace/gmail/markup/reference/types/State)

Extends [AdministrativeArea](/workspace/gmail/markup/reference/types/AdministrativeArea)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/Hostel

Send feedback

# Hostel Stay organized with collections Save and categorize content based on your preferences.

Type name: [Hostel](/workspace/gmail/markup/reference/types/Hostel)

Extends [LodgingBusiness](/workspace/gmail/markup/reference/types/LodgingBusiness)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/Event

Send feedback

# Event Stay organized with collections Save and categorize content based on your preferences.

Type name: [Event](/workspace/gmail/markup/reference/types/Event)

Extends [Thing](/workspace/gmail/markup/reference/types/Thing)

| Name | Type | Description |
| --- | --- | --- |
| attendee | [Organization](/workspace/gmail/markup/reference/types/Organization) or [Person](/workspace/gmail/markup/reference/types/Person) | A person or organization attending the event. |
| attendees | [Organization](/workspace/gmail/markup/reference/types/Organization) or [Person](/workspace/gmail/markup/reference/types/Person) | A person attending the event. |
| doorTime | [DateTime](/workspace/gmail/markup/reference/types/DateTime) | The time admission will commence. |
| duration | [Duration](/workspace/gmail/markup/reference/types/Duration) | The duration of the item (movie, audio recording, event, etc.) in [ISO 8601 date format](http://en.wikipedia.org/wiki/ISO_8601). |
| endDate | [Date](/workspace/gmail/markup/reference/types/Date) | The end date and time of the item (in [ISO 8601 date format](http://en.wikipedia.org/wiki/ISO_8601)). |
| eventStatus | [EventStatusType](/workspace/gmail/markup/reference/types/EventStatusType) | An eventStatus of an event represents its status; particularly useful when an event is cancelled or rescheduled. |
| location | [Place](/workspace/gmail/markup/reference/types/Place) or [PostalAddress](/workspace/gmail/markup/reference/types/PostalAddress) | The location of the event, organization or action. |
| offers | [Offer](/workspace/gmail/markup/reference/types/Offer) | An offer to provide this item—for example, an offer to sell a product, rent the DVD of a movie, or give away tickets to an event. |
| organizer | [Organization](/workspace/gmail/markup/reference/types/Organization) or [Person](/workspace/gmail/markup/reference/types/Person) | An organizer of an Event. |
| performer | [Organization](/workspace/gmail/markup/reference/types/Organization) or [Person](/workspace/gmail/markup/reference/types/Person) | A performer at the event—for example, a presenter, musician, musical group or actor. |
| performers | [Organization](/workspace/gmail/markup/reference/types/Organization) or [Person](/workspace/gmail/markup/reference/types/Person) | The main performer or performers of the event—for example, a presenter, musician, or actor. |
| previousStartDate | [Date](/workspace/gmail/markup/reference/types/Date) | Used in conjunction with eventStatus for rescheduled or cancelled events. This property contains the previously scheduled start date. For rescheduled events, the startDate property should be used for the newly scheduled start date. In the (rare) case of an event that has been postponed and rescheduled multiple times, this field may be repeated. |
| recordedIn | [CreativeWork](/workspace/gmail/markup/reference/types/CreativeWork) | The CreativeWork that captured all or part of this Event. |
| startDate | [Date](/workspace/gmail/markup/reference/types/Date) | The start date and time of the item (in [ISO 8601 date format](http://en.wikipedia.org/wiki/ISO_8601)). |
| subEvent | [Event](/workspace/gmail/markup/reference/types/Event) | An Event that is part of this event. For example, a conference event includes many presentations, each of which is a subEvent of the conference. |
| subEvents | [Event](/workspace/gmail/markup/reference/types/Event) | Events that are a part of this event. For example, a conference event includes many presentations, each subEvents of the conference. |
| superEvent | [Event](/workspace/gmail/markup/reference/types/Event) | An event that this event is a part of. For example, a collection of individual music performances might each have a music festival as their superEvent. |
| typicalAgeRange | [Text](/workspace/gmail/markup/reference/types/Text) | The typical expected age range, e.g. '7-9', '11-'. |
| workPerformed | [CreativeWork](/workspace/gmail/markup/reference/types/CreativeWork) | A work performed in some event, for example a play performed in a TheaterEvent. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/HighSchool

Send feedback

# HighSchool Stay organized with collections Save and categorize content based on your preferences.

Type name: [HighSchool](/workspace/gmail/markup/reference/types/HighSchool)

Extends [EducationalOrganization](/workspace/gmail/markup/reference/types/EducationalOrganization)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/MedicalContraindication

Send feedback

# MedicalContraindication Stay organized with collections Save and categorize content based on your preferences.

Type name: [MedicalContraindication](/workspace/gmail/markup/reference/types/MedicalContraindication)

Extends [MedicalEntity](/workspace/gmail/markup/reference/types/MedicalEntity)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/PlaceOfWorship

Send feedback

# PlaceOfWorship Stay organized with collections Save and categorize content based on your preferences.

Type name: [PlaceOfWorship](/workspace/gmail/markup/reference/types/PlaceOfWorship)

Extends [CivicStructure](/workspace/gmail/markup/reference/types/CivicStructure)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/RadioClip

Send feedback

# RadioClip Stay organized with collections Save and categorize content based on your preferences.

Type name: [RadioClip](/workspace/gmail/markup/reference/types/RadioClip)

Extends [Clip](/workspace/gmail/markup/reference/types/Clip)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/AutoRental

Send feedback

# AutoRental Stay organized with collections Save and categorize content based on your preferences.

Type name: [AutoRental](/workspace/gmail/markup/reference/types/AutoRental)

Extends [AutomotiveBusiness](/workspace/gmail/markup/reference/types/AutomotiveBusiness)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.settings/getAutoForwarding

Send feedback

# Method: users.settings.getAutoForwarding Stay organized with collections Save and categorize content based on your preferences.

* [HTTP request](#body.HTTP_TEMPLATE)
* [Path parameters](#body.PATH_PARAMETERS)
* [Request body](#body.request_body)
* [Response body](#body.response_body)
* [Authorization scopes](#body.aspect)
* [Try it!](#try-it)

Gets the auto-forwarding setting for the specified account.

### HTTP request

`GET https://gmail.googleapis.com/gmail/v1/users/{userId}/settings/autoForwarding`

The URL uses [gRPC Transcoding](https://google.aip.dev/127) syntax.

### Path parameters

| Parameters | |
| --- | --- |
| `userId` | `string`  User's email address. The special value "me" can be used to indicate the authenticated user. |

### Request body

The request body must be empty.

### Response body

If successful, the response body contains an instance of `AutoForwarding`.

### Authorization scopes

Requires one of the following OAuth scopes:

* `https://www.googleapis.com/auth/gmail.settings.basic`
* `https://mail.google.com/`
* `https://www.googleapis.com/auth/gmail.modify`
* `https://www.googleapis.com/auth/gmail.readonly`

For more information, see the [OAuth 2.0 Overview](/identity/protocols/OAuth2).




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/Joint

Send feedback

# Joint Stay organized with collections Save and categorize content based on your preferences.

Type name: [Joint](/workspace/gmail/markup/reference/types/Joint)

Extends [AnatomicalStructure](/workspace/gmail/markup/reference/types/AnatomicalStructure)

| Name | Type | Description |
| --- | --- | --- |
| biomechnicalClass | [Text](/workspace/gmail/markup/reference/types/Text) | The biomechanical properties of the bone. |
| functionalClass | [Text](/workspace/gmail/markup/reference/types/Text) | The degree of mobility the joint allows. |
| structuralClass | [Text](/workspace/gmail/markup/reference/types/Text) | The name given to how bone physically connects to each other. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/InsertAction

Send feedback

# InsertAction Stay organized with collections Save and categorize content based on your preferences.

Type name: [InsertAction](/workspace/gmail/markup/reference/types/InsertAction)

Extends [AddAction](/workspace/gmail/markup/reference/types/AddAction)

| Name | Type | Description |
| --- | --- | --- |
| toLocation | [Place](/workspace/gmail/markup/reference/types/Place) | A sub property of location. The final location of the object or the agent after the action. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/api/reference/rest/v1/users/stop

Send feedback

# Method: users.stop Stay organized with collections Save and categorize content based on your preferences.

* [HTTP request](#body.HTTP_TEMPLATE)
* [Path parameters](#body.PATH_PARAMETERS)
* [Request body](#body.request_body)
* [Response body](#body.response_body)
* [Authorization scopes](#body.aspect)
* [Try it!](#try-it)

users.stop receiving push notifications for the given user mailbox.

### HTTP request

`POST https://gmail.googleapis.com/gmail/v1/users/{userId}/stop`

The URL uses [gRPC Transcoding](https://google.aip.dev/127) syntax.

### Path parameters

| Parameters | |
| --- | --- |
| `userId` | `string`  The user's email address. The special value `me` can be used to indicate the authenticated user. |

### Request body

The request body must be empty.

### Response body

If successful, the response body is an empty JSON object.

### Authorization scopes

Requires one of the following OAuth scopes:

* `https://mail.google.com/`
* `https://www.googleapis.com/auth/gmail.modify`
* `https://www.googleapis.com/auth/gmail.readonly`
* `https://www.googleapis.com/auth/gmail.metadata`

For more information, see the [OAuth 2.0 Overview](/identity/protocols/OAuth2).




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/EmailMessage2

Send feedback

# EmailMessage Stay organized with collections Save and categorize content based on your preferences.

Type name: [EmailMessage](/workspace/gmail/markup/reference/types/EmailMessage)

Extends [CreativeWork](/workspace/gmail/markup/reference/types/CreativeWork) or [CreativeWork](/workspace/gmail/markup/reference/types/CreativeWork)

| Name | Type | Description |
| --- | --- | --- |
| **potentialAction**  **(Required)** | [ViewAction](/workspace/gmail/markup/reference/types/ViewAction) | Actions supported for EmailMessage. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/AgreeAction

Send feedback

# AgreeAction Stay organized with collections Save and categorize content based on your preferences.

Type name: [AgreeAction](/workspace/gmail/markup/reference/types/AgreeAction)

Extends [ReactAction](/workspace/gmail/markup/reference/types/ReactAction)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/Cemetery

Send feedback

# Cemetery Stay organized with collections Save and categorize content based on your preferences.

Type name: [Cemetery](/workspace/gmail/markup/reference/types/Cemetery)

Extends [CivicStructure](/workspace/gmail/markup/reference/types/CivicStructure)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/RadioSeries

Send feedback

# RadioSeries Stay organized with collections Save and categorize content based on your preferences.

Type name: [RadioSeries](/workspace/gmail/markup/reference/types/RadioSeries)

Extends [Series](/workspace/gmail/markup/reference/types/Series)

| Name | Type | Description |
| --- | --- | --- |
| actor | [Person](/workspace/gmail/markup/reference/types/Person) | An actor, e.g. in tv, radio, movie, video games etc. Actors can be associated with individual items or with a series, episode, clip. |
| actors | [Person](/workspace/gmail/markup/reference/types/Person) | An actor, e.g. in tv, radio, movie, video games etc. Actors can be associated with individual items or with a series, episode, clip. |
| director | [Person](/workspace/gmail/markup/reference/types/Person) | A director of e.g. tv, radio, movie, video games etc. content. Directors can be associated with individual items or with a series, episode, clip. |
| directors | [Person](/workspace/gmail/markup/reference/types/Person) | A director of e.g. tv, radio, movie, video games etc. content. Directors can be associated with individual items or with a series, episode, clip. |
| episode | [Episode](/workspace/gmail/markup/reference/types/Episode) | An episode of a tv, radio or game media within a series or season. |
| episodes | [Episode](/workspace/gmail/markup/reference/types/Episode) | An episode of a TV/radio series or season. |
| musicBy | [MusicGroup](/workspace/gmail/markup/reference/types/MusicGroup) or [Person](/workspace/gmail/markup/reference/types/Person) | The composer of the soundtrack. |
| numberOfEpisodes | [Number](/workspace/gmail/markup/reference/types/Number) | The number of episodes in this season or series. |
| numberOfSeasons | [Number](/workspace/gmail/markup/reference/types/Number) | The number of seasons in this series. |
| productionCompany | [Organization](/workspace/gmail/markup/reference/types/Organization) | The production company or studio responsible for the item e.g. series, video game, episode etc. |
| season | [Season](/workspace/gmail/markup/reference/types/Season) | A season in a media series. |
| seasons | [Season](/workspace/gmail/markup/reference/types/Season) | A season in a media series. |
| trailer | [VideoObject](/workspace/gmail/markup/reference/types/VideoObject) | The trailer of a movie or tv/radio series, season, episode, etc. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/DDxElement

Send feedback

# DDxElement Stay organized with collections Save and categorize content based on your preferences.

Type name: [DDxElement](/workspace/gmail/markup/reference/types/DDxElement)

Extends [MedicalIntangible](/workspace/gmail/markup/reference/types/MedicalIntangible)

| Name | Type | Description |
| --- | --- | --- |
| diagnosis | [MedicalCondition](/workspace/gmail/markup/reference/types/MedicalCondition) | One or more alternative conditions considered in the differential diagnosis process. |
| distinguishingSign | [MedicalSignOrSymptom](/workspace/gmail/markup/reference/types/MedicalSignOrSymptom) | One of a set of signs and symptoms that can be used to distinguish this diagnosis from others in the differential diagnosis. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/ParkingFacility

Send feedback

# ParkingFacility Stay organized with collections Save and categorize content based on your preferences.

Type name: [ParkingFacility](/workspace/gmail/markup/reference/types/ParkingFacility)

Extends [CivicStructure](/workspace/gmail/markup/reference/types/CivicStructure)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/FlightReservation

Send feedback

# FlightReservation Stay organized with collections Save and categorize content based on your preferences.

Type name: [FlightReservation](/workspace/gmail/markup/reference/types/FlightReservation)

Extends [Reservation](/workspace/gmail/markup/reference/types/Reservation)

| Name | Type | Description |
| --- | --- | --- |
| **additionalTicketText** | [Text](/workspace/gmail/markup/reference/types/Text) | Additional information about the boarding pass. |
| **airplaneSeat** | [Text](/workspace/gmail/markup/reference/types/Text) | The location of the reserved seat (e.g., 27B). |
| **airplaneSeatClass** |  | The cabin/class of the airplaneSeat. |
| airplaneSeatClass.**name** | [Text](/workspace/gmail/markup/reference/types/Text) | Name of the AirplaneSeatClass. |
| **boardingGroup** | [Text](/workspace/gmail/markup/reference/types/Text) | The airline-specific indicator of boarding order / preference. |
| **bookingAgent** | [Organization](/workspace/gmail/markup/reference/types/Organization) or [Person](/workspace/gmail/markup/reference/types/Person) | Booking agent or agency. Also accepts a string (e.g. ""). |
| bookingAgent.**name** | [Text](/workspace/gmail/markup/reference/types/Text) | Name of the agent/service. |
| bookingAgent.**url** | [URL](/workspace/gmail/markup/reference/types/URL) | Website of the agent/service. |
| **bookingTime** | [DateTime](/workspace/gmail/markup/reference/types/DateTime) | Date the reservation was made. |
| **modifiedTime** | [DateTime](/workspace/gmail/markup/reference/types/DateTime) | (recommended for Confirmation Cards/Search Answers) Time the reservation was last modified. |
| **potentialAction** | , [ConfirmAction](/workspace/gmail/markup/reference/types/ConfirmAction), [CancelAction](/workspace/gmail/markup/reference/types/CancelAction) or [CheckInAction](/workspace/gmail/markup/reference/types/CheckInAction) | Action that can be performed on the reservation. |
| potentialAction.**target** | [EntryPoint](/workspace/gmail/markup/reference/types/EntryPoint) | Specifies a handler to process the action, typically a simple URL. |
| **programMembership** | [ProgramMembership](/workspace/gmail/markup/reference/types/ProgramMembership) | Any membership in a frequent flyer, hotel loyalty program, etc. being applied to the reservation. |
| programMembership.**memberNumber** | [Text](/workspace/gmail/markup/reference/types/Text) | The identifier of the membership. |
| programMembership.**program** | [Text](/workspace/gmail/markup/reference/types/Text) | The name of the program. |
| **reservationFor**  **(Required)** | [Flight](/workspace/gmail/markup/reference/types/Flight) | The flight the reservation is for. |
| reservationFor.**airline**  **(Required)** | [Airline](/workspace/gmail/markup/reference/types/Airline) | The airline providing the flight. |
| reservationFor.airline.**iataCode**  **(Required)** | [Text](/workspace/gmail/markup/reference/types/Text) | The IATA code for the airline. |
| reservationFor.airline.**name**  **(Required)** | [Text](/workspace/gmail/markup/reference/types/Text) | Name of the Airline. |
| reservationFor.**arrivalAirport**  **(Required)** | [Airport](/workspace/gmail/markup/reference/types/Airport) | The final destination of the flight. Also accepts a string (e.g. "John F. Kennedy International Airport JFK"). |
| reservationFor.arrivalAirport.**iataCode**  **(Required)** | [Text](/workspace/gmail/markup/reference/types/Text) | The IATA code for the airport (e.g. 'UA'). |
| reservationFor.arrivalAirport.**name**  **(Required)** | [Text](/workspace/gmail/markup/reference/types/Text) | Name of the Airport. |
| reservationFor.**arrivalGate** | [Text](/workspace/gmail/markup/reference/types/Text) | Identifier of the airport arrival gate of the flight. |
| reservationFor.**arrivalTerminal** | [Text](/workspace/gmail/markup/reference/types/Text) | The airport terminal of the arrivalGate. |
| reservationFor.**arrivalTime**  **(Required)** | [DateTime](/workspace/gmail/markup/reference/types/DateTime) | Expected time of arrival. |
| reservationFor.**boardingTime** | [DateTime](/workspace/gmail/markup/reference/types/DateTime) | Time when boarding will commence. |
| reservationFor.**departureAirport**  **(Required)** | [Airport](/workspace/gmail/markup/reference/types/Airport) | The departure airport for the flight. Also accepts a string (e.g. "San Francisco Airport SFO"). |
| reservationFor.departureAirport.**iataCode**  **(Required)** | [Text](/workspace/gmail/markup/reference/types/Text) | The IATA code for the airport (e.g. 'UA'). |
| reservationFor.departureAirport.**name**  **(Required)** | [Text](/workspace/gmail/markup/reference/types/Text) | Name of the Airport. |
| reservationFor.**departureGate** | [Text](/workspace/gmail/markup/reference/types/Text) | Identifier of the airport departure gate of the flight. |
| reservationFor.**departureTerminal** | [Text](/workspace/gmail/markup/reference/types/Text) | The airport terminal of the departureGate. |
| reservationFor.**departureTime**  **(Required)** | [DateTime](/workspace/gmail/markup/reference/types/DateTime) | Expected time of departure. |
| reservationFor.**flightNumber**  **(Required)** | [Text](/workspace/gmail/markup/reference/types/Text) | Flight identifier. |
| reservationFor.**operatedBy** | [Airline](/workspace/gmail/markup/reference/types/Airline) | The airline operating the flight. |
| reservationFor.operatedBy.**iataCode** | [Text](/workspace/gmail/markup/reference/types/Text) | The IATA code for the airline. |
| reservationFor.operatedBy.**name** | [Text](/workspace/gmail/markup/reference/types/Text) | Name of the Airline. |
| reservationFor.**webCheckinTime** | [DateTime](/workspace/gmail/markup/reference/types/DateTime) | Earliest time for web checkin. |
| **reservationNumber**  **(Required)** | [Text](/workspace/gmail/markup/reference/types/Text) | The number or id of the reservation. |
| **reservationStatus**  **(Required)** | [ReservationStatus](/workspace/gmail/markup/reference/types/ReservationStatus) | Current status of the reservation. |
| **ticketDownloadUrl** | [URL](/workspace/gmail/markup/reference/types/URL) | Where the boarding pass can be downloaded. |
| **ticketNumber** | [Text](/workspace/gmail/markup/reference/types/Text) | The number or id of the ticket. |
| **ticketPrintUrl** | [URL](/workspace/gmail/markup/reference/types/URL) | Where the boarding pass can be printed. |
| **ticketToken** | [Text](/workspace/gmail/markup/reference/types/Text) or [URL](/workspace/gmail/markup/reference/types/URL) | If the barcode image is hosted on your site, the value of the field is URL of the image, or a barcode or QR URI, such as "barcode128:AB34" (ISO-15417 barcodes), "qrCode:AB34" (QR codes), "aztecCode:AB34" (Aztec codes), "barcodeEAN:1234" (EAN codes) and "barcodeUPCA:1234" (UPCA codes). |
| **underName**  **(Required)** | [Organization](/workspace/gmail/markup/reference/types/Organization) or [Person](/workspace/gmail/markup/reference/types/Person) | The passenger. |
| underName.**email** | [Text](/workspace/gmail/markup/reference/types/Text) | Email address. |
| underName.**name**  **(Required)** | [Text](/workspace/gmail/markup/reference/types/Text) | Name of the Person. |
| **url** | [URL](/workspace/gmail/markup/reference/types/URL) | Web page where reservation can be viewed. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/Playground

Send feedback

# Playground Stay organized with collections Save and categorize content based on your preferences.

Type name: [Playground](/workspace/gmail/markup/reference/types/Playground)

Extends [CivicStructure](/workspace/gmail/markup/reference/types/CivicStructure)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.threads/trash

Send feedback

# Method: users.threads.trash Stay organized with collections Save and categorize content based on your preferences.

* [HTTP request](#body.HTTP_TEMPLATE)
* [Path parameters](#body.PATH_PARAMETERS)
* [Request body](#body.request_body)
* [Response body](#body.response_body)
* [Authorization scopes](#body.aspect)
* [Try it!](#try-it)

Moves the specified thread to the trash. Any messages that belong to the thread are also moved to the trash.

### HTTP request

`POST https://gmail.googleapis.com/gmail/v1/users/{userId}/threads/{id}/trash`

The URL uses [gRPC Transcoding](https://google.aip.dev/127) syntax.

### Path parameters

| Parameters | |
| --- | --- |
| `userId` | `string`  The user's email address. The special value `me` can be used to indicate the authenticated user. |
| `id` | `string`  The ID of the thread to Trash. |

### Request body

The request body must be empty.

### Response body

If successful, the response body contains an instance of `Thread`.

### Authorization scopes

Requires one of the following OAuth scopes:

* `https://mail.google.com/`
* `https://www.googleapis.com/auth/gmail.modify`

For more information, see the [OAuth 2.0 Overview](/identity/protocols/OAuth2).




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/BusStop

Send feedback

# BusStop Stay organized with collections Save and categorize content based on your preferences.

Type name: [BusStop](/workspace/gmail/markup/reference/types/BusStop)

Extends [CivicStructure](/workspace/gmail/markup/reference/types/CivicStructure)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/Courthouse

Send feedback

# Courthouse Stay organized with collections Save and categorize content based on your preferences.

Type name: [Courthouse](/workspace/gmail/markup/reference/types/Courthouse)

Extends [GovernmentBuilding](/workspace/gmail/markup/reference/types/GovernmentBuilding)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/PayAction

Send feedback

# PayAction Stay organized with collections Save and categorize content based on your preferences.

Type name: [PayAction](/workspace/gmail/markup/reference/types/PayAction)

Extends [TradeAction](/workspace/gmail/markup/reference/types/TradeAction)

| Name | Type | Description |
| --- | --- | --- |
| purpose | [MedicalDevicePurpose](/workspace/gmail/markup/reference/types/MedicalDevicePurpose) or [Thing](/workspace/gmail/markup/reference/types/Thing) | A goal towards an action is taken. Can be concrete or abstract. |
| recipient | [Audience](/workspace/gmail/markup/reference/types/Audience), [Organization](/workspace/gmail/markup/reference/types/Organization) or [Person](/workspace/gmail/markup/reference/types/Person) | A sub property of participant. The participant who is at the receiving end of the action. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/TrackAction

Send feedback

# TrackAction Stay organized with collections Save and categorize content based on your preferences.

Type name: [TrackAction](/workspace/gmail/markup/reference/types/TrackAction)

Extends [FindAction](/workspace/gmail/markup/reference/types/FindAction)

| Name | Type | Description |
| --- | --- | --- |
| deliveryMethod | [DeliveryMethod](/workspace/gmail/markup/reference/types/DeliveryMethod) | A sub property of instrument. The method of delivery. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/DataDownload

Send feedback

# DataDownload Stay organized with collections Save and categorize content based on your preferences.

Type name: [DataDownload](/workspace/gmail/markup/reference/types/DataDownload)

Extends [MediaObject](/workspace/gmail/markup/reference/types/MediaObject)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/GovernmentBuilding

Send feedback

# GovernmentBuilding Stay organized with collections Save and categorize content based on your preferences.

Type name: [GovernmentBuilding](/workspace/gmail/markup/reference/types/GovernmentBuilding)

Extends [CivicStructure](/workspace/gmail/markup/reference/types/CivicStructure)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/UnRegisterAction

Send feedback

# UnRegisterAction Stay organized with collections Save and categorize content based on your preferences.

Type name: [UnRegisterAction](/workspace/gmail/markup/reference/types/UnRegisterAction)

Extends [InteractAction](/workspace/gmail/markup/reference/types/InteractAction)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/RadioSeason

Send feedback

# RadioSeason Stay organized with collections Save and categorize content based on your preferences.

Type name: [RadioSeason](/workspace/gmail/markup/reference/types/RadioSeason)

Extends [Season](/workspace/gmail/markup/reference/types/Season)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/PhysicalTherapy

Send feedback

# PhysicalTherapy Stay organized with collections Save and categorize content based on your preferences.

Type name: [PhysicalTherapy](/workspace/gmail/markup/reference/types/PhysicalTherapy)

Extends [MedicalTherapy](/workspace/gmail/markup/reference/types/MedicalTherapy)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/ElectronicsStore

Send feedback

# ElectronicsStore Stay organized with collections Save and categorize content based on your preferences.

Type name: [ElectronicsStore](/workspace/gmail/markup/reference/types/ElectronicsStore)

Extends [Store](/workspace/gmail/markup/reference/types/Store)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/Date

Send feedback

# Date Stay organized with collections Save and categorize content based on your preferences.

Type name: [Date](/workspace/gmail/markup/reference/types/Date)

Extends [DataType](/workspace/gmail/markup/reference/types/DataType)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/VideoObject

Send feedback

# VideoObject Stay organized with collections Save and categorize content based on your preferences.

Type name: [VideoObject](/workspace/gmail/markup/reference/types/VideoObject)

Extends [MediaObject](/workspace/gmail/markup/reference/types/MediaObject)

| Name | Type | Description |
| --- | --- | --- |
| actor | [Person](/workspace/gmail/markup/reference/types/Person) | An actor, e.g. in tv, radio, movie, video games etc. Actors can be associated with individual items or with a series, episode, clip. |
| actors | [Person](/workspace/gmail/markup/reference/types/Person) | An actor, e.g. in tv, radio, movie, video games etc. Actors can be associated with individual items or with a series, episode, clip. |
| caption | [Text](/workspace/gmail/markup/reference/types/Text) | The caption for this object. |
| director | [Person](/workspace/gmail/markup/reference/types/Person) | A director of e.g. tv, radio, movie, video games etc. content. Directors can be associated with individual items or with a series, episode, clip. |
| directors | [Person](/workspace/gmail/markup/reference/types/Person) | A director of e.g. tv, radio, movie, video games etc. content. Directors can be associated with individual items or with a series, episode, clip. |
| musicBy | [MusicGroup](/workspace/gmail/markup/reference/types/MusicGroup) or [Person](/workspace/gmail/markup/reference/types/Person) | The composer of the soundtrack. |
| thumbnail | [ImageObject](/workspace/gmail/markup/reference/types/ImageObject) | Thumbnail image for an image or video. |
| transcript | [Text](/workspace/gmail/markup/reference/types/Text) | If this MediaObject is an AudioObject or VideoObject, the transcript of that object. |
| videoFrameSize | [Text](/workspace/gmail/markup/reference/types/Text) | The frame size of the video. |
| videoQuality | [Text](/workspace/gmail/markup/reference/types/Text) | The quality of the video. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/OrganizationRole

Send feedback

# OrganizationRole Stay organized with collections Save and categorize content based on your preferences.

Type name: [OrganizationRole](/workspace/gmail/markup/reference/types/OrganizationRole)

Extends [Role](/workspace/gmail/markup/reference/types/Role)

| Name | Type | Description |
| --- | --- | --- |
| numberedPosition | [Number](/workspace/gmail/markup/reference/types/Number) | A number associated with a role in an organization, for example, the number on an athlete's jersey. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/Taxi

Send feedback

# Taxi Stay organized with collections Save and categorize content based on your preferences.

Type name: [Taxi](/workspace/gmail/markup/reference/types/Taxi)

Extends [Service](/workspace/gmail/markup/reference/types/Service)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/TradeAction

Send feedback

# TradeAction Stay organized with collections Save and categorize content based on your preferences.

Type name: [TradeAction](/workspace/gmail/markup/reference/types/TradeAction)

Extends [Action](/workspace/gmail/markup/reference/types/Action)

| Name | Type | Description |
| --- | --- | --- |
| price | [Number](/workspace/gmail/markup/reference/types/Number) or [Text](/workspace/gmail/markup/reference/types/Text) | Total price of the Reservation. |
| priceSpecification | [PriceSpecification](/workspace/gmail/markup/reference/types/PriceSpecification) | One or more detailed price specifications, indicating the unit price and delivery or payment charges. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/DrugCostCategory

Send feedback

# DrugCostCategory Stay organized with collections Save and categorize content based on your preferences.

Type name: [DrugCostCategory](/workspace/gmail/markup/reference/types/DrugCostCategory)

Extends [Enumeration](/workspace/gmail/markup/reference/types/Enumeration) or [MedicalEnumeration](/workspace/gmail/markup/reference/types/MedicalEnumeration)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/ActionHandler

Send feedback

# ActionHandler Stay organized with collections Save and categorize content based on your preferences.

Type name: [ActionHandler](/workspace/gmail/markup/reference/types/ActionHandler)

Extends [Intangible](/workspace/gmail/markup/reference/types/Intangible)

| Name | Type | Description |
| --- | --- | --- |
| actionType | [URL](/workspace/gmail/markup/reference/types/URL) | Type of action that the handler accepts. This is to allow user agents to automatically discover potential action handlers for various actions. |
| optionalProperty | [Property](/workspace/gmail/markup/reference/types/Property) | Property that can be specified on the Action that the handler supports. |
| requiredProperty | [Property](/workspace/gmail/markup/reference/types/Property) | Property that must be provided on the action for it to be handled by the handler. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/Festival

Send feedback

# Festival Stay organized with collections Save and categorize content based on your preferences.

Type name: [Festival](/workspace/gmail/markup/reference/types/Festival)

Extends [Event](/workspace/gmail/markup/reference/types/Event)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/ReplyAction

Send feedback

# ReplyAction Stay organized with collections Save and categorize content based on your preferences.

Type name: [ReplyAction](/workspace/gmail/markup/reference/types/ReplyAction)

Extends [CommunicateAction](/workspace/gmail/markup/reference/types/CommunicateAction)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.settings

Send feedback

# REST Resource: users.settings Stay organized with collections Save and categorize content based on your preferences.

* [Resource](#RESOURCE_REPRESENTATION)
* [Methods](#METHODS_SUMMARY)

## Resource

There is no persistent data associated with this resource.

| Methods | |
| --- | --- |
| `getAutoForwarding` | Gets the auto-forwarding setting for the specified account. |
| `getImap` | Gets IMAP settings. |
| `getLanguage` | Gets language settings. |
| `getPop` | Gets POP settings. |
| `getVacation` | Gets vacation responder settings. |
| `updateAutoForwarding` | Updates the auto-forwarding setting for the specified account. |
| `updateImap` | Updates IMAP settings. |
| `updateLanguage` | Updates language settings. |
| `updatePop` | Updates POP settings. |
| `updateVacation` | Updates vacation responder settings. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/HttpActionHandler

Send feedback

# HttpActionHandler Stay organized with collections Save and categorize content based on your preferences.

Type name: [HttpActionHandler](/workspace/gmail/markup/reference/types/HttpActionHandler)

Extends [ActionHandler](/workspace/gmail/markup/reference/types/ActionHandler)

| Name | Type | Description |
| --- | --- | --- |
| encoding | or [MediaObject](/workspace/gmail/markup/reference/types/MediaObject) | How to encode the action into the http request when the method is POST. |
| method | [HttpRequestMethod](/workspace/gmail/markup/reference/types/HttpRequestMethod) | Whether to use HTTP GET or POST. GET is the default. |
| url | [URL](/workspace/gmail/markup/reference/types/URL) | Target url to fetch in order to complete the action. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/Episode

Send feedback

# Episode Stay organized with collections Save and categorize content based on your preferences.

Type name: [Episode](/workspace/gmail/markup/reference/types/Episode)

Extends [CreativeWork](/workspace/gmail/markup/reference/types/CreativeWork)

| Name | Type | Description |
| --- | --- | --- |
| actor | [Person](/workspace/gmail/markup/reference/types/Person) | An actor, e.g. in tv, radio, movie, video games etc. Actors can be associated with individual items or with a series, episode, clip. |
| actors | [Person](/workspace/gmail/markup/reference/types/Person) | An actor, e.g. in tv, radio, movie, video games etc. Actors can be associated with individual items or with a series, episode, clip. |
| director | [Person](/workspace/gmail/markup/reference/types/Person) | A director of e.g. tv, radio, movie, video games etc. content. Directors can be associated with individual items or with a series, episode, clip. |
| directors | [Person](/workspace/gmail/markup/reference/types/Person) | A director of e.g. tv, radio, movie, video games etc. content. Directors can be associated with individual items or with a series, episode, clip. |
| episodeNumber | [Integer](/workspace/gmail/markup/reference/types/Integer) or [Text](/workspace/gmail/markup/reference/types/Text) | Position of the episode within an ordered group of episodes. |
| musicBy | [MusicGroup](/workspace/gmail/markup/reference/types/MusicGroup) or [Person](/workspace/gmail/markup/reference/types/Person) | The composer of the soundtrack. |
| partOfSeason | [Season](/workspace/gmail/markup/reference/types/Season) | The season to which this episode belongs. |
| partOfSeries | [Series](/workspace/gmail/markup/reference/types/Series) | The series to which this episode or season belongs. |
| productionCompany | [Organization](/workspace/gmail/markup/reference/types/Organization) | The production company or studio responsible for the item e.g. series, video game, episode etc. |
| publication | [PublicationEvent](/workspace/gmail/markup/reference/types/PublicationEvent) | A publication event associated with the episode, clip or media object. |
| trailer | [VideoObject](/workspace/gmail/markup/reference/types/VideoObject) | The trailer of a movie or tv/radio series, season, episode, etc. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/JoinAction

Send feedback

# JoinAction Stay organized with collections Save and categorize content based on your preferences.

Type name: [JoinAction](/workspace/gmail/markup/reference/types/JoinAction)

Extends [InteractAction](/workspace/gmail/markup/reference/types/InteractAction)

| Name | Type | Description |
| --- | --- | --- |
| event | [Event](/workspace/gmail/markup/reference/types/Event) | The event information. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/MedicalClinic

Send feedback

# MedicalClinic Stay organized with collections Save and categorize content based on your preferences.

Type name: [MedicalClinic](/workspace/gmail/markup/reference/types/MedicalClinic)

Extends [MedicalOrganization](/workspace/gmail/markup/reference/types/MedicalOrganization)

| Name | Type | Description |
| --- | --- | --- |
| availableService | [MedicalProcedure](/workspace/gmail/markup/reference/types/MedicalProcedure), [MedicalTest](/workspace/gmail/markup/reference/types/MedicalTest) or [MedicalTherapy](/workspace/gmail/markup/reference/types/MedicalTherapy) | A medical service available from this provider. |
| medicalSpecialty | [MedicalSpecialty](/workspace/gmail/markup/reference/types/MedicalSpecialty) | A medical specialty of the provider. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/ReactAction

Send feedback

# ReactAction Stay organized with collections Save and categorize content based on your preferences.

Type name: [ReactAction](/workspace/gmail/markup/reference/types/ReactAction)

Extends [AssessAction](/workspace/gmail/markup/reference/types/AssessAction)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/SearchAction

Send feedback

# SearchAction Stay organized with collections Save and categorize content based on your preferences.

Type name: [SearchAction](/schemas/reference/types/SearchAction)

Extends [Action](/schemas/reference/types/Action)

| Name | Type | Description |
| --- | --- | --- |
| query | [Class](/schemas/reference/types/Class) or [Text](/schemas/reference/types/Text) | A sub property of instrument. The query used on this action. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/api/reference/rest/v1/LanguageSettings

Send feedback

# LanguageSettings Stay organized with collections Save and categorize content based on your preferences.

* [JSON representation](#SCHEMA_REPRESENTATION)

Language settings for an account. These settings correspond to the ["Language settings"](https://support.google.com/mail/answer/17091) feature in the web interface.

| JSON representation |
| --- |
| ``` {   "displayLanguage": string } ``` |

| Fields | |
| --- | --- |
| `displayLanguage` | `string`  The language to display Gmail in, formatted as an [RFC 3066 Language Tag](https://www.w3.org/International/articles/language-tags/) (for example `en-GB`, `fr` or `ja` for British English, French, or Japanese respectively).  The set of languages supported by Gmail evolves over time, so please refer to the "Language" dropdown in the [Gmail settings](https://mail.google.com/mail/u/0/#settings/general)  for all available options, as described in the [language settings help article](https://support.google.com/mail/answer/17091). For a table of sample values, see [Manage language settings](https://developers.google.com/workspace/gmail/api/guides/language-settings).  Not all Gmail clients can display the same set of languages. In the case that a user's display language is not available for use on a particular client, said client automatically chooses to display in the closest supported variant (or a reasonable default). |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/ToyStore

Send feedback

# ToyStore Stay organized with collections Save and categorize content based on your preferences.

Type name: [ToyStore](/workspace/gmail/markup/reference/types/ToyStore)

Extends [Store](/workspace/gmail/markup/reference/types/Store)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/Synagogue

Send feedback

# Synagogue Stay organized with collections Save and categorize content based on your preferences.

Type name: [Synagogue](/workspace/gmail/markup/reference/types/Synagogue)

Extends [PlaceOfWorship](/workspace/gmail/markup/reference/types/PlaceOfWorship)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list

Send feedback

# Method: users.messages.list Stay organized with collections Save and categorize content based on your preferences.

* [HTTP request](#body.HTTP_TEMPLATE)
* [Path parameters](#body.PATH_PARAMETERS)
* [Query parameters](#body.QUERY_PARAMETERS)
* [Request body](#body.request_body)
* [Response body](#body.response_body)
  + [JSON representation](#body.ListMessagesResponse.SCHEMA_REPRESENTATION)
* [Authorization scopes](#body.aspect)
* [Try it!](#try-it)

Lists the messages in the user's mailbox. For example usage, see [List Gmail messages](https://developers.google.com/workspace/gmail/api/guides/list-messages).

### HTTP request

`GET https://gmail.googleapis.com/gmail/v1/users/{userId}/messages`

The URL uses [gRPC Transcoding](https://google.aip.dev/127) syntax.

### Path parameters

| Parameters | |
| --- | --- |
| `userId` | `string`  The user's email address. The special value `me` can be used to indicate the authenticated user. |

### Query parameters

| Parameters | |
| --- | --- |
| `maxResults` | `integer (uint32 format)`  Maximum number of messages to return. This field defaults to 100. The maximum allowed value for this field is 500. |
| `pageToken` | `string`  Page token to retrieve a specific page of results in the list. |
| `q` | `string`  Only return messages matching the specified query. Supports the same query format as the Gmail search box. For example, `"from:someuser@example.com rfc822msgid:<somemsgid@example.com> is:unread"`. Parameter cannot be used when accessing the api using the gmail.metadata scope. |
| `labelIds[]` | `string`  Only return messages with labels that match all of the specified label IDs. Messages in a thread might have labels that other messages in the same thread don't have. To learn more, see [Manage labels on messages and threads](https://developers.google.com/workspace/gmail/api/guides/labels#manage_labels_on_messages_threads). |
| `includeSpamTrash` | `boolean`  Include messages from `SPAM` and `TRASH` in the results. |

### Request body

The request body must be empty.

### Response body

If successful, the response body contains data with the following structure:

| JSON representation |
| --- |
| ``` {   "messages": [     {       object (Message)     }   ],   "nextPageToken": string,   "resultSizeEstimate": integer } ``` |

| Fields | |
| --- | --- |
| `messages[]` | `object (Message)`  List of messages. Note that each message resource contains only an `id` and a `threadId`. Additional message details can be fetched using the [messages.get](/workspace/gmail/api/v1/reference/users/messages/get) method. |
| `nextPageToken` | `string`  Token to retrieve the next page of results in the list. |
| `resultSizeEstimate` | `integer (uint32 format)`  Estimated total number of results. |

### Authorization scopes

Requires one of the following OAuth scopes:

* `https://mail.google.com/`
* `https://www.googleapis.com/auth/gmail.modify`
* `https://www.googleapis.com/auth/gmail.readonly`
* `https://www.googleapis.com/auth/gmail.metadata`

For more information, see the [OAuth 2.0 Overview](/identity/protocols/OAuth2).




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/Demand

Send feedback

# Demand Stay organized with collections Save and categorize content based on your preferences.

Type name: [Demand](/workspace/gmail/markup/reference/types/Demand)

Extends [Intangible](/workspace/gmail/markup/reference/types/Intangible)

| Name | Type | Description |
| --- | --- | --- |
| acceptedPaymentMethod | [PaymentMethod](/workspace/gmail/markup/reference/types/PaymentMethod) | The payment method(s) accepted by seller for this offer. |
| advanceBookingRequirement | [QuantitativeValue](/workspace/gmail/markup/reference/types/QuantitativeValue) | The amount of time that is required between accepting the offer and the actual usage of the resource or service. |
| availability | [ItemAvailability](/workspace/gmail/markup/reference/types/ItemAvailability) | The availability of this item—for example In stock, Out of stock, Pre-order, etc. |
| availabilityEnds | [DateTime](/workspace/gmail/markup/reference/types/DateTime) | The end of the availability of the product or service included in the offer. |
| availabilityStarts | [DateTime](/workspace/gmail/markup/reference/types/DateTime) | The beginning of the availability of the product or service included in the offer. |
| availableAtOrFrom | [Place](/workspace/gmail/markup/reference/types/Place) | The place(s) from which the offer can be obtained (e.g. store locations). |
| availableDeliveryMethod | [DeliveryMethod](/workspace/gmail/markup/reference/types/DeliveryMethod) | The delivery method(s) available for this offer. |
| businessFunction | [BusinessFunction](/workspace/gmail/markup/reference/types/BusinessFunction) | The business function (e.g. sell, lease, repair, dispose) of the offer or component of a bundle (TypeAndQuantityNode). The default is http://purl.org/goodrelations/v1#Sell. |
| deliveryLeadTime | [QuantitativeValue](/workspace/gmail/markup/reference/types/QuantitativeValue) | The typical delay between the receipt of the order and the goods leaving the warehouse. |
| eligibleCustomerType | [BusinessEntityType](/workspace/gmail/markup/reference/types/BusinessEntityType) | The type(s) of customers for which the given offer is valid. |
| eligibleDuration | [QuantitativeValue](/workspace/gmail/markup/reference/types/QuantitativeValue) | The duration for which the given offer is valid. |
| eligibleQuantity | [QuantitativeValue](/workspace/gmail/markup/reference/types/QuantitativeValue) | The interval and unit of measurement of ordering quantities for which the offer or price specification is valid. This allows e.g. specifying that a certain freight charge is valid only for a certain quantity. |
| eligibleRegion | [GeoShape](/workspace/gmail/markup/reference/types/GeoShape) or [Text](/workspace/gmail/markup/reference/types/Text) | The ISO 3166-1 (ISO 3166-1 alpha-2) or ISO 3166-2 code, or the GeoShape for the geo-political region(s) for which the offer or delivery charge specification is valid. |
| eligibleTransactionVolume | [PriceSpecification](/workspace/gmail/markup/reference/types/PriceSpecification) | The transaction volume, in a monetary unit, for which the offer or price specification is valid, e.g. for indicating a minimal purchasing volume, to express free shipping above a certain order volume, or to limit the acceptance of credit cards to purchases to a certain minimal amount. |
| gtin13 | [Text](/workspace/gmail/markup/reference/types/Text) | The [13-digit Global Trade Item](https://en.wikipedia.org/wiki/Global_Trade_Item_Number) code of the product, or the product to which the offer refers. This is equivalent to 13-digit ISBN codes and EAN UCC-13. Former 12-digit UPC codes can be converted into a GTIN-13 code by simply adding a preceding zero. See [GS1 GTIN Summary](http://www.gs1.org/barcodes/technical/idkeys/gtin) for more details. |
| gtin14 | [Text](/workspace/gmail/markup/reference/types/Text) | The [14-digit Global Trade Item](https://en.wikipedia.org/wiki/Global_Trade_Item_Number) code of the product, or the product to which the offer refers. See [GS1 GTIN Summary](http://www.gs1.org/barcodes/technical/idkeys/gtin) for more details. |
| gtin8 | [Text](/workspace/gmail/markup/reference/types/Text) | The [8-digit Global Trade Item](https://en.wikipedia.org/wiki/Global_Trade_Item_Number) code of the product, or the product to which the offer refers. This code is also known as EAN/UCC-8 or 8-digit EAN. See [GS1 GTIN Summary](http://www.gs1.org/barcodes/technical/idkeys/gtin) for more details. |
| includesObject | [TypeAndQuantityNode](/workspace/gmail/markup/reference/types/TypeAndQuantityNode) | This links to a node or nodes indicating the exact quantity of the products included in the offer. |
| inventoryLevel | [QuantitativeValue](/workspace/gmail/markup/reference/types/QuantitativeValue) | The current approximate inventory level for the item or items. |
| itemCondition | [OfferItemCondition](/workspace/gmail/markup/reference/types/OfferItemCondition) | A predefined value from OfferItemCondition or a textual description of the condition of the product or service, or the products or services included in the offer. |
| itemOffered | [Product](/workspace/gmail/markup/reference/types/Product) | The item being offered. |
| mpn | [Text](/workspace/gmail/markup/reference/types/Text) | The Manufacturer Part Number (MPN) of the product, or the product to which the offer refers. |
| priceSpecification | [PriceSpecification](/workspace/gmail/markup/reference/types/PriceSpecification) | One or more detailed price specifications, indicating the unit price and delivery or payment charges. |
| seller | [Organization](/workspace/gmail/markup/reference/types/Organization) or [Person](/workspace/gmail/markup/reference/types/Person) | An entity which offers (sells / leases / lends / loans) the services / goods. A seller may also be a provider. |
| serialNumber | [Text](/workspace/gmail/markup/reference/types/Text) | The serial number or any alphanumeric identifier of a particular product. When attached to an offer, it is a shortcut for the serial number of the product included in the offer. |
| sku | [Text](/workspace/gmail/markup/reference/types/Text) | The Stock Keeping Unit (SKU), i.e. a merchant-specific identifier for a product or service, or the product to which the offer refers. |
| validFrom | [DateTime](/workspace/gmail/markup/reference/types/DateTime) | The date when the item becomes valid. |
| validThrough | [DateTime](/workspace/gmail/markup/reference/types/DateTime) | The end of the validity of offer, price specification, or opening hours data. |
| warranty | [WarrantyPromise](/workspace/gmail/markup/reference/types/WarrantyPromise) | The warranty promise(s) included in the offer. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/CityHall

Send feedback

# CityHall Stay organized with collections Save and categorize content based on your preferences.

Type name: [CityHall](/workspace/gmail/markup/reference/types/CityHall)

Extends [GovernmentBuilding](/workspace/gmail/markup/reference/types/GovernmentBuilding)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/CheckoutPage

Send feedback

# CheckoutPage Stay organized with collections Save and categorize content based on your preferences.

Type name: [CheckoutPage](/workspace/gmail/markup/reference/types/CheckoutPage)

Extends [WebPage](/workspace/gmail/markup/reference/types/WebPage)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/CheckInAction

Send feedback

# CheckInAction Stay organized with collections Save and categorize content based on your preferences.

Type name: [CheckInAction](/workspace/gmail/markup/reference/types/CheckInAction)

Extends [CommunicateAction](/workspace/gmail/markup/reference/types/CommunicateAction)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/LoseAction

Send feedback

# LoseAction Stay organized with collections Save and categorize content based on your preferences.

Type name: [LoseAction](/workspace/gmail/markup/reference/types/LoseAction)

Extends [AchieveAction](/workspace/gmail/markup/reference/types/AchieveAction)

| Name | Type | Description |
| --- | --- | --- |
| winner | [Person](/workspace/gmail/markup/reference/types/Person) | A sub property of participant. The winner of the action. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/WarrantyScope

Send feedback

# WarrantyScope Stay organized with collections Save and categorize content based on your preferences.

Type name: [WarrantyScope](/workspace/gmail/markup/reference/types/WarrantyScope)

Extends [Enumeration](/workspace/gmail/markup/reference/types/Enumeration)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/InsuranceAgency

Send feedback

# InsuranceAgency Stay organized with collections Save and categorize content based on your preferences.

Type name: [InsuranceAgency](/workspace/gmail/markup/reference/types/InsuranceAgency)

Extends [FinancialService](/workspace/gmail/markup/reference/types/FinancialService)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/TheaterEvent

Send feedback

# TheaterEvent Stay organized with collections Save and categorize content based on your preferences.

Type name: [TheaterEvent](/workspace/gmail/markup/reference/types/TheaterEvent)

Extends [Event](/workspace/gmail/markup/reference/types/Event)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/PostOffice

Send feedback

# PostOffice Stay organized with collections Save and categorize content based on your preferences.

Type name: [PostOffice](/workspace/gmail/markup/reference/types/PostOffice)

Extends [GovernmentOffice](/workspace/gmail/markup/reference/types/GovernmentOffice)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/Property

Send feedback

# Property Stay organized with collections Save and categorize content based on your preferences.

Type name: [Property](/workspace/gmail/markup/reference/types/Property)

Extends [Intangible](/workspace/gmail/markup/reference/types/Intangible)

| Name | Type | Description |
| --- | --- | --- |
| domainIncludes | [Class](/workspace/gmail/markup/reference/types/Class) | Relates a property to a class that is (one of) the type(s) the property is expected to be used on. |
| inverseOf | [Property](/workspace/gmail/markup/reference/types/Property) | Relates a property to a property that is its inverse. Inverse properties relate the same pairs of items to each other, but in reversed direction. For example, the 'alumni' and 'alumniOf' properties are inverseOf each other. Some properties don't have explicit inverses; in these situations RDFa and JSON-LD syntax for reverse properties can be used. |
| rangeIncludes | [Class](/workspace/gmail/markup/reference/types/Class) | Relates a property to a class that constitutes (one of) the expected type(s) for values of the property. |
| supersededBy | [Property](/workspace/gmail/markup/reference/types/Property) | Relates a property to one that supersedes it. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/RadioEpisode

Send feedback

# RadioEpisode Stay organized with collections Save and categorize content based on your preferences.

Type name: [RadioEpisode](/workspace/gmail/markup/reference/types/RadioEpisode)

Extends [Episode](/workspace/gmail/markup/reference/types/Episode)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/BookSeries

Send feedback

# BookSeries Stay organized with collections Save and categorize content based on your preferences.

Type name: [BookSeries](/workspace/gmail/markup/reference/types/BookSeries)

Extends [Series](/workspace/gmail/markup/reference/types/Series)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.settings/updateLanguage

Send feedback

# Method: users.settings.updateLanguage Stay organized with collections Save and categorize content based on your preferences.

* [HTTP request](#body.HTTP_TEMPLATE)
* [Path parameters](#body.PATH_PARAMETERS)
* [Request body](#body.request_body)
* [Response body](#body.response_body)
* [Authorization scopes](#body.aspect)
* [Try it!](#try-it)

Updates language settings.

If successful, the return object contains the `displayLanguage` that was saved for the user, which may differ from the value passed into the request. This is because the requested `displayLanguage` may not be directly supported by Gmail but have a close variant that is, and so the variant may be chosen and saved instead.

### HTTP request

`PUT https://gmail.googleapis.com/gmail/v1/users/{userId}/settings/language`

The URL uses [gRPC Transcoding](https://google.aip.dev/127) syntax.

### Path parameters

| Parameters | |
| --- | --- |
| `userId` | `string`  User's email address. The special value "me" can be used to indicate the authenticated user. |

### Request body

The request body contains an instance of `LanguageSettings`.

### Response body

If successful, the response body contains an instance of `LanguageSettings`.

### Authorization scopes

Requires the following OAuth scope:

* `https://www.googleapis.com/auth/gmail.settings.basic`

For more information, see the [OAuth 2.0 Overview](/identity/protocols/OAuth2).




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/postmaster/reference/rest/v2beta/domains.domainStats/query

Send feedback

# Method: domains.domainStats.query Stay organized with collections Save and categorize content based on your preferences.

* [HTTP request](#body.HTTP_TEMPLATE)
* [Path parameters](#body.PATH_PARAMETERS)
* [Request body](#body.request_body)
  + [JSON representation](#body.request_body.SCHEMA_REPRESENTATION)
* [Response body](#body.response_body)
* [Authorization scopes](#body.aspect)

**Developer Preview:** Available as part of the [Google Workspace Developer Preview Program](https://developers.google.com/workspace/preview), which grants early access to certain features. Retrieves a list of domain statistics for a given domain and time period. Returns statistics only for dates where data is available. Returns PERMISSION\_DENIED if you don't have permission to access DomainStats for the domain.

### HTTP request

`POST https://gmailpostmastertools.googleapis.com/v2beta/{parent=domains/*}/domainStats:query`

The URL uses [gRPC Transcoding](https://google.aip.dev/127) syntax.

### Path parameters

| Parameters | |
| --- | --- |
| `parent` | `string`  Required. The parent resource name where the stats are queried. Format: domains/{domain} |

### Request body

The request body contains data with the following structure:

| JSON representation |
| --- |
| ``` {   "metricDefinitions": [     {       object (MetricDefinition)     }   ],   "timeQuery": {     object (TimeQuery)   },   "pageSize": integer,   "pageToken": string,   "aggregationGranularity": enum (AggregationGranularity) } ``` |

| Fields | |
| --- | --- |
| `metricDefinitions[]` | `object (MetricDefinition)`  Required. The specific metrics to query. You can define a custom name for each metric, which will be used in the response. |
| `timeQuery` | `object (TimeQuery)`  Required. The time range or specific dates for which to retrieve the metrics. |
| `pageSize` | `integer`  Optional. The maximum number of DomainStats resources to return in the response. The server may return fewer than this value. If unspecified, a default value of 10 will be used. The maximum value is 200. |
| `pageToken` | `string`  Optional. The nextPageToken value returned from a previous List request, if any. If the aggregation granularity is DAILY, the page token will be the encoded date + "/" + metric name. If the aggregation granularity is OVERALL, the page token will be the encoded metric name. |
| `aggregationGranularity` | `enum (AggregationGranularity)`  Optional. The granularity at which to aggregate the statistics. If unspecified, defaults to DAILY. |

### Response body

If successful, the response body contains an instance of `QueryDomainStatsResponse`.

### Authorization scopes

Requires one of the following OAuth scopes:

* `https://www.googleapis.com/auth/postmaster`
* `https://www.googleapis.com/auth/postmaster.traffic.readonly`

For more information, see the [Authorization guide](https://developers.google.com/workspace/guides/configure-oauth-consent).




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/PathologyTest

Send feedback

# PathologyTest Stay organized with collections Save and categorize content based on your preferences.

Type name: [PathologyTest](/workspace/gmail/markup/reference/types/PathologyTest)

Extends [MedicalTest](/workspace/gmail/markup/reference/types/MedicalTest)

| Name | Type | Description |
| --- | --- | --- |
| tissueSample | [Text](/workspace/gmail/markup/reference/types/Text) | The type of tissue sample required for the test. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/GameServer

Send feedback

# GameServer Stay organized with collections Save and categorize content based on your preferences.

Type name: [GameServer](/workspace/gmail/markup/reference/types/GameServer)

Extends [Intangible](/workspace/gmail/markup/reference/types/Intangible)

| Name | Type | Description |
| --- | --- | --- |
| game | [VideoGame](/workspace/gmail/markup/reference/types/VideoGame) | Video game which is played on this server. |
| playersOnline | [Number](/workspace/gmail/markup/reference/types/Number) | Number of players on the server. |
| serverStatus | [GameServerStatus](/workspace/gmail/markup/reference/types/GameServerStatus) | Status of a game server. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/MedicalObservationalStudyDesign

Send feedback

# MedicalObservationalStudyDesign Stay organized with collections Save and categorize content based on your preferences.

Type name: [MedicalObservationalStudyDesign](/workspace/gmail/markup/reference/types/MedicalObservationalStudyDesign)

Extends [Enumeration](/workspace/gmail/markup/reference/types/Enumeration) or [MedicalEnumeration](/workspace/gmail/markup/reference/types/MedicalEnumeration)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.history/list

Send feedback

# Method: users.history.list Stay organized with collections Save and categorize content based on your preferences.

* [HTTP request](#body.HTTP_TEMPLATE)
* [Path parameters](#body.PATH_PARAMETERS)
* [Query parameters](#body.QUERY_PARAMETERS)
* [Request body](#body.request_body)
* [Response body](#body.response_body)
  + [JSON representation](#body.ListHistoryResponse.SCHEMA_REPRESENTATION)
* [Authorization scopes](#body.aspect)
* [HistoryType](#HistoryType)
* [History](#History)
  + [JSON representation](#History.SCHEMA_REPRESENTATION)
* [MessageAdded](#MessageAdded)
  + [JSON representation](#MessageAdded.SCHEMA_REPRESENTATION)
* [MessageDeleted](#MessageDeleted)
  + [JSON representation](#MessageDeleted.SCHEMA_REPRESENTATION)
* [LabelAdded](#LabelAdded)
  + [JSON representation](#LabelAdded.SCHEMA_REPRESENTATION)
* [LabelRemoved](#LabelRemoved)
  + [JSON representation](#LabelRemoved.SCHEMA_REPRESENTATION)
* [Try it!](#try-it)

Lists the history of all changes to the given mailbox. History results are returned in chronological order (increasing `historyId`).

### HTTP request

`GET https://gmail.googleapis.com/gmail/v1/users/{userId}/history`

The URL uses [gRPC Transcoding](https://google.aip.dev/127) syntax.

### Path parameters

| Parameters | |
| --- | --- |
| `userId` | `string`  The user's email address. The special value `me` can be used to indicate the authenticated user. |

### Query parameters

| Parameters | |
| --- | --- |
| `maxResults` | `integer (uint32 format)`  Maximum number of history records to return. This field defaults to 100. The maximum allowed value for this field is 500. |
| `pageToken` | `string`  Page token to retrieve a specific page of results in the list. |
| `startHistoryId` | `string`  Required. Returns history records after the specified `startHistoryId`. The supplied `startHistoryId` should be obtained from the `historyId` of a message, thread, or previous `list` response. History IDs increase chronologically but are not contiguous with random gaps in between valid IDs. Supplying an invalid or out of date `startHistoryId` typically returns an `HTTP 404` error code. A `historyId` is typically valid for at least a week, but in some rare circumstances may be valid for only a few hours. If you receive an `HTTP 404` error response, your application should perform a full sync. If you receive no `nextPageToken` in the response, there are no updates to retrieve and you can store the returned `historyId` for a future request. |
| `labelId` | `string`  Only return messages with a label matching the ID. |
| `historyTypes[]` | `enum (HistoryType)`  History types to be returned by the function |

### Request body

The request body must be empty.

### Response body

If successful, the response body contains data with the following structure:

| JSON representation |
| --- |
| ``` {   "history": [     {       object (History)     }   ],   "nextPageToken": string,   "historyId": string } ``` |

| Fields | |
| --- | --- |
| `history[]` | `object (History)`  List of history records. Any `messages` contained in the response will typically only have `id` and `threadId` fields populated. |
| `nextPageToken` | `string`  Page token to retrieve the next page of results in the list. |
| `historyId` | `string`  The ID of the mailbox's current history record. |

### Authorization scopes

Requires one of the following OAuth scopes:

* `https://mail.google.com/`
* `https://www.googleapis.com/auth/gmail.modify`
* `https://www.googleapis.com/auth/gmail.readonly`
* `https://www.googleapis.com/auth/gmail.metadata`

For more information, see the [OAuth 2.0 Overview](/identity/protocols/OAuth2).

## HistoryType

| Enums | |
| --- | --- |
| `messageAdded` |  |
| `messageDeleted` |  |
| `labelAdded` |  |
| `labelRemoved` |  |

## History

A record of a change to the user's mailbox. Each history change may affect multiple messages in multiple ways.

| JSON representation |
| --- |
| ``` {   "id": string,   "messages": [     {       object (Message)     }   ],   "messagesAdded": [     {       object (MessageAdded)     }   ],   "messagesDeleted": [     {       object (MessageDeleted)     }   ],   "labelsAdded": [     {       object (LabelAdded)     }   ],   "labelsRemoved": [     {       object (LabelRemoved)     }   ] } ``` |

| Fields | |
| --- | --- |
| `id` | `string`  The mailbox sequence ID. |
| `messages[]` | `object (Message)`  List of messages changed in this history record. The fields for specific change types, such as `messagesAdded` may duplicate messages in this field. We recommend using the specific change-type fields instead of this. |
| `messagesAdded[]` | `object (MessageAdded)`  Messages added to the mailbox in this history record. |
| `messagesDeleted[]` | `object (MessageDeleted)`  Messages deleted (not Trashed) from the mailbox in this history record. |
| `labelsAdded[]` | `object (LabelAdded)`  Labels added to messages in this history record. |
| `labelsRemoved[]` | `object (LabelRemoved)`  Labels removed from messages in this history record. |

## MessageAdded

| JSON representation |
| --- |
| ``` {   "message": {     object (Message)   } } ``` |

| Fields | |
| --- | --- |
| `message` | `object (Message)` |

## MessageDeleted

| JSON representation |
| --- |
| ``` {   "message": {     object (Message)   } } ``` |

| Fields | |
| --- | --- |
| `message` | `object (Message)` |

## LabelAdded

| JSON representation |
| --- |
| ``` {   "message": {     object (Message)   },   "labelIds": [     string   ] } ``` |

| Fields | |
| --- | --- |
| `message` | `object (Message)` |
| `labelIds[]` | `string`  Label IDs added to the message. |

## LabelRemoved

| JSON representation |
| --- |
| ``` {   "message": {     object (Message)   },   "labelIds": [     string   ] } ``` |

| Fields | |
| --- | --- |
| `message` | `object (Message)` |
| `labelIds[]` | `string`  Label IDs removed from the message. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/BarOrPub

Send feedback

# BarOrPub Stay organized with collections Save and categorize content based on your preferences.

Type name: [BarOrPub](/workspace/gmail/markup/reference/types/BarOrPub)

Extends [FoodEstablishment](/workspace/gmail/markup/reference/types/FoodEstablishment)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/HairSalon

Send feedback

# HairSalon Stay organized with collections Save and categorize content based on your preferences.

Type name: [HairSalon](/workspace/gmail/markup/reference/types/HairSalon)

Extends [HealthAndBeautyBusiness](/workspace/gmail/markup/reference/types/HealthAndBeautyBusiness)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/DonateAction

Send feedback

# DonateAction Stay organized with collections Save and categorize content based on your preferences.

Type name: [DonateAction](/workspace/gmail/markup/reference/types/DonateAction)

Extends [TradeAction](/workspace/gmail/markup/reference/types/TradeAction)

| Name | Type | Description |
| --- | --- | --- |
| recipient | [Audience](/workspace/gmail/markup/reference/types/Audience), [Organization](/workspace/gmail/markup/reference/types/Organization) or [Person](/workspace/gmail/markup/reference/types/Person) | A sub property of participant. The participant who is at the receiving end of the action. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.settings.cse.keypairs/enable

Send feedback

# Method: users.settings.cse.keypairs.enable Stay organized with collections Save and categorize content based on your preferences.

* [HTTP request](#body.HTTP_TEMPLATE)
* [Path parameters](#body.PATH_PARAMETERS)
* [Request body](#body.request_body)
* [Response body](#body.response_body)
* [Authorization scopes](#body.aspect)
* [Try it!](#try-it)

Turns on a client-side encryption key pair that was turned off. The key pair becomes active again for any associated client-side encryption identities.

For administrators managing identities and keypairs for users in their organization, requests require authorization with a [service account](https://developers.google.com/identity/protocols/OAuth2ServiceAccount) that has [domain-wide delegation authority](https://developers.google.com/identity/protocols/OAuth2ServiceAccount#delegatingauthority) to impersonate users with the `https://www.googleapis.com/auth/gmail.settings.basic` scope.

For users managing their own identities and keypairs, requests require [hardware key encryption](https://support.google.com/a/answer/14153163) turned on and configured.

### HTTP request

`POST https://gmail.googleapis.com/gmail/v1/users/{userId}/settings/cse/keypairs/{keyPairId}:enable`

The URL uses [gRPC Transcoding](https://google.aip.dev/127) syntax.

### Path parameters

| Parameters | |
| --- | --- |
| `userId` | `string`  The requester's primary email address. To indicate the authenticated user, you can use the special value `me`. |
| `keyPairId` | `string`  The identifier of the key pair to turn on. |

### Request body

The request body must be empty.

### Response body

If successful, the response body contains an instance of `CseKeyPair`.

### Authorization scopes

Requires one of the following OAuth scopes:

* `https://www.googleapis.com/auth/gmail.settings.basic`
* `https://www.googleapis.com/auth/gmail.settings.sharing`

For more information, see the [OAuth 2.0 Overview](/identity/protocols/OAuth2).




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.threads/delete

Send feedback

# Method: users.threads.delete Stay organized with collections Save and categorize content based on your preferences.

* [HTTP request](#body.HTTP_TEMPLATE)
* [Path parameters](#body.PATH_PARAMETERS)
* [Request body](#body.request_body)
* [Response body](#body.response_body)
* [Authorization scopes](#body.aspect)
* [Try it!](#try-it)

Immediately and permanently deletes the specified thread. Any messages that belong to the thread are also deleted. This operation cannot be undone. Prefer `threads.trash` instead.

### HTTP request

`DELETE https://gmail.googleapis.com/gmail/v1/users/{userId}/threads/{id}`

The URL uses [gRPC Transcoding](https://google.aip.dev/127) syntax.

### Path parameters

| Parameters | |
| --- | --- |
| `userId` | `string`  The user's email address. The special value `me` can be used to indicate the authenticated user. |
| `id` | `string`  ID of the Thread to delete. |

### Request body

The request body must be empty.

### Response body

If successful, the response body is an empty JSON object.

### Authorization scopes

Requires the following OAuth scope:

* `https://mail.google.com/`

For more information, see the [OAuth 2.0 Overview](/identity/protocols/OAuth2).




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/ExerciseAction

Send feedback

# ExerciseAction Stay organized with collections Save and categorize content based on your preferences.

Type name: [ExerciseAction](/workspace/gmail/markup/reference/types/ExerciseAction)

Extends [PlayAction](/workspace/gmail/markup/reference/types/PlayAction)

| Name | Type | Description |
| --- | --- | --- |
| course | [Place](/workspace/gmail/markup/reference/types/Place) | A sub property of location. The course where this action was taken. |
| diet | [Diet](/workspace/gmail/markup/reference/types/Diet) | A sub property of instrument. The diet used in this action. |
| distance | [Distance](/workspace/gmail/markup/reference/types/Distance) | The distance travelled, e.g. exercising or travelling. |
| exercisePlan | [ExercisePlan](/workspace/gmail/markup/reference/types/ExercisePlan) | A sub property of instrument. The exercise plan used on this action. |
| exerciseType | [Text](/workspace/gmail/markup/reference/types/Text) | Type(s) of exercise or activity, such as strength training, flexibility training, aerobics, cardiac rehabilitation, etc. |
| fromLocation | [Place](/workspace/gmail/markup/reference/types/Place) | A sub property of location. The original location of the object or the agent before the action. |
| opponent | [Person](/workspace/gmail/markup/reference/types/Person) | A sub property of participant. The opponent on this action. |
| sportsActivityLocation | [SportsActivityLocation](/workspace/gmail/markup/reference/types/SportsActivityLocation) | A sub property of location. The sports activity location where this action occurred. |
| sportsEvent | [SportsEvent](/workspace/gmail/markup/reference/types/SportsEvent) | A sub property of location. The sports event where this action occurred. |
| sportsTeam | [SportsTeam](/workspace/gmail/markup/reference/types/SportsTeam) | A sub property of participant. The sports team that participated on this action. |
| toLocation | [Place](/workspace/gmail/markup/reference/types/Place) | A sub property of location. The final location of the object or the agent after the action. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.settings.filters

Send feedback

# REST Resource: users.settings.filters Stay organized with collections Save and categorize content based on your preferences.

* [Resource: Filter](#Filter)
  + [JSON representation](#Filter.SCHEMA_REPRESENTATION)
* [Criteria](#Criteria)
  + [JSON representation](#Criteria.SCHEMA_REPRESENTATION)
* [SizeComparison](#SizeComparison)
* [Action](#Action)
  + [JSON representation](#Action.SCHEMA_REPRESENTATION)
* [Methods](#METHODS_SUMMARY)

## Resource: Filter

Resource definition for Gmail filters. Filters apply to specific messages instead of an entire email thread.

| JSON representation |
| --- |
| ``` {   "id": string,   "criteria": {     object (Criteria)   },   "action": {     object (Action)   } } ``` |

| Fields | |
| --- | --- |
| `id` | `string`  The server assigned ID of the filter. |
| `criteria` | `object (Criteria)`  Matching criteria for the filter. |
| `action` | `object (Action)`  Action that the filter performs. |

## Criteria

Message matching criteria.

| JSON representation |
| --- |
| ``` {   "from": string,   "to": string,   "subject": string,   "query": string,   "negatedQuery": string,   "hasAttachment": boolean,   "excludeChats": boolean,   "size": integer,   "sizeComparison": enum (SizeComparison) } ``` |

| Fields | |
| --- | --- |
| `from` | `string`  The sender's display name or email address. |
| `to` | `string`  The recipient's display name or email address. Includes recipients in the "to", "cc", and "bcc" header fields. You can use simply the local part of the email address. For example, "example" and "example@" both match "example@gmail.com". This field is case-insensitive. |
| `subject` | `string`  Case-insensitive phrase found in the message's subject. Trailing and leading whitespace are be trimmed and adjacent spaces are collapsed. |
| `query` | `string`  Only return messages matching the specified query. Supports the same query format as the Gmail search box. For example, `"from:someuser@example.com rfc822msgid:<somemsgid@example.com> is:unread"`. |
| `negatedQuery` | `string`  Only return messages not matching the specified query. Supports the same query format as the Gmail search box. For example, `"from:someuser@example.com rfc822msgid:<somemsgid@example.com> is:unread"`. |
| `hasAttachment` | `boolean`  Whether the message has any attachment. |
| `excludeChats` | `boolean`  Whether the response should exclude chats. |
| `size` | `integer`  The size of the entire RFC822 message in bytes, including all headers and attachments. |
| `sizeComparison` | `enum (SizeComparison)`  How the message size in bytes should be in relation to the size field. |

## SizeComparison

Determines how the size field should be compared to the message size.

| Enums | |
| --- | --- |
| `unspecified` |  |
| `smaller` | Find messages smaller than the given size. |
| `larger` | Find messages larger than the given size. |

## Action

A set of actions to perform on a message.

| JSON representation |
| --- |
| ``` {   "addLabelIds": [     string   ],   "removeLabelIds": [     string   ],   "forward": string } ``` |

| Fields | |
| --- | --- |
| `addLabelIds[]` | `string`  List of labels to add to the message. |
| `removeLabelIds[]` | `string`  List of labels to remove from the message. |
| `forward` | `string`  Email address that the message should be forwarded to. |

| Methods | |
| --- | --- |
| `create` | Creates a filter. |
| `delete` | Immediately and permanently deletes the specified filter. |
| `get` | Gets a filter. |
| `list` | Lists the message filters of a Gmail user. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/Organization

Send feedback

# Organization Stay organized with collections Save and categorize content based on your preferences.

Type name: [Organization](/workspace/gmail/markup/reference/types/Organization)

Extends [Thing](/workspace/gmail/markup/reference/types/Thing)

| Name | Type | Description |
| --- | --- | --- |
| address | [PostalAddress](/workspace/gmail/markup/reference/types/PostalAddress) | Physical address of the item. |
| aggregateRating | [AggregateRating](/workspace/gmail/markup/reference/types/AggregateRating) | The overall rating, based on a collection of reviews or ratings, of the item. |
| brand | [Brand](/workspace/gmail/markup/reference/types/Brand) or [Organization](/workspace/gmail/markup/reference/types/Organization) | The brand(s) associated with a product or service, or the brand(s) maintained by an organization or business person. |
| contactPoint | [ContactPoint](/workspace/gmail/markup/reference/types/ContactPoint) | A contact point for a person or organization. |
| contactPoints | [ContactPoint](/workspace/gmail/markup/reference/types/ContactPoint) | A contact point for a person or organization. |
| department | [Organization](/workspace/gmail/markup/reference/types/Organization) | A relationship between an organization and a department of that organization, also described as an organization (allowing different urls, logos, opening hours). For example: a store with a pharmacy, or a bakery with a cafe. |
| dissolutionDate | [Date](/workspace/gmail/markup/reference/types/Date) | The date that this organization was dissolved. |
| duns | [Text](/workspace/gmail/markup/reference/types/Text) | The Dun & Bradstreet DUNS number for identifying an organization or business person. |
| email | [Text](/workspace/gmail/markup/reference/types/Text) | Email address. |
| employee | [Person](/workspace/gmail/markup/reference/types/Person) | Someone working for this organization. |
| employees | [Person](/workspace/gmail/markup/reference/types/Person) | People working for this organization. |
| event | [Event](/workspace/gmail/markup/reference/types/Event) | The event information. |
| events | [Event](/workspace/gmail/markup/reference/types/Event) | Upcoming or past events associated with this place or organization. |
| faxNumber | [Text](/workspace/gmail/markup/reference/types/Text) | The fax number. |
| founder | [Person](/workspace/gmail/markup/reference/types/Person) | A person who founded this organization. |
| founders | [Person](/workspace/gmail/markup/reference/types/Person) | A person who founded this organization. |
| foundingDate | [Date](/workspace/gmail/markup/reference/types/Date) | The date that this organization was founded. |
| foundingLocation | [Place](/workspace/gmail/markup/reference/types/Place) | The place where the Organization was founded. |
| globalLocationNumber | [Text](/workspace/gmail/markup/reference/types/Text) | The Global Location Number (GLN, sometimes also referred to as International Location Number or ILN) of the respective organization, person, or place. The GLN is a 13-digit number used to identify parties and physical locations. |
| hasPOS | [Place](/workspace/gmail/markup/reference/types/Place) | Points-of-Sales operated by the organization or person. |
| interactionCount | [Text](/workspace/gmail/markup/reference/types/Text) | A count of a specific user interactions with this item—for example, `20 UserLikes`, `5 UserComments`, or `300 UserDownloads`. The user interaction type should be one of the sub types of [UserInteraction](/workspace/gmail/markup/reference/types/UserInteraction). |
| isicV4 | [Text](/workspace/gmail/markup/reference/types/Text) | The International Standard of Industrial Classification of All Economic Activities (ISIC), Revision 4 code for a particular organization, business person, or place. |
| legalName | [Text](/workspace/gmail/markup/reference/types/Text) | The official name of the organization, e.g. the registered company name. |
| location | [Place](/workspace/gmail/markup/reference/types/Place) or [PostalAddress](/workspace/gmail/markup/reference/types/PostalAddress) | The location of the event, organization or action. |
| logo | [ImageObject](/workspace/gmail/markup/reference/types/ImageObject) or [URL](/workspace/gmail/markup/reference/types/URL) | An associated logo. |
| makesOffer | [Offer](/workspace/gmail/markup/reference/types/Offer) | A pointer to products or services offered by the organization or person. |
| member | [Organization](/workspace/gmail/markup/reference/types/Organization) or [Person](/workspace/gmail/markup/reference/types/Person) | A member of an Organization or a ProgramMembership. Organizations can be members of organizations; ProgramMembership is typically for individuals. |
| memberOf | [Organization](/workspace/gmail/markup/reference/types/Organization) or [ProgramMembership](/workspace/gmail/markup/reference/types/ProgramMembership) | An Organization (or ProgramMembership) to which this Person or Organization belongs. |
| members | [Organization](/workspace/gmail/markup/reference/types/Organization) or [Person](/workspace/gmail/markup/reference/types/Person) | A member of this organization. |
| naics | [Text](/workspace/gmail/markup/reference/types/Text) | The North American Industry Classification System (NAICS) code for a particular organization or business person. |
| owns | [OwnershipInfo](/workspace/gmail/markup/reference/types/OwnershipInfo) or [Product](/workspace/gmail/markup/reference/types/Product) | Products owned by the organization or person. |
| review | [Review](/workspace/gmail/markup/reference/types/Review) | The review. |
| reviews | [Review](/workspace/gmail/markup/reference/types/Review) | Review of the item. |
| seeks | [Demand](/workspace/gmail/markup/reference/types/Demand) | A pointer to products or services sought by the organization or person (demand). |
| subOrganization | [Organization](/workspace/gmail/markup/reference/types/Organization) | A relationship between two organizations where the first includes the second, e.g., as a subsidiary. See also: the more specific 'department' property. |
| taxID | [Text](/workspace/gmail/markup/reference/types/Text) | The Tax / Fiscal ID of the organization or person, e.g. the TIN in the US or the CIF/NIF in Spain. |
| telephone | [Text](/workspace/gmail/markup/reference/types/Text) | The telephone number. |
| vatID | [Text](/workspace/gmail/markup/reference/types/Text) | The Value-added Tax ID of the organization or person. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/api/guides/language-settings

Send feedback

# Manage language settings Stay organized with collections Save and categorize content based on your preferences.

You can use [Settings](/workspace/gmail/api/v1/reference/users/settings) to configure
language settings for an account, which sets the language to display Gmail in.

For information on how to
[get](/workspace/gmail/api/v1/reference/users/settings/getLanguage) or
[update](/workspace/gmail/api/v1/reference/users/settings/updateLanguage) language
settings, see the [Settings reference](/workspace/gmail/api/v1/reference/users/settings).

## Display language

As noted in the [Settings reference](/workspace/gmail/api/v1/reference/users/settings),
the format of display languages in the
[get](/workspace/gmail/api/v1/reference/users/settings/getLanguage) and
[update](/workspace/gmail/api/v1/reference/users/settings/updateLanguage) language
settings methods is the
[RFC 3066 Language Tag format](https://www.w3.org/International/articles/language-tags).

Not all Gmail clients can display the same set of languages.
In the case that a user's display language is not available for use on a
particular client, said client automatically chooses to display in the closest
supported variant (or a reasonable default).

The set of languages supported by Gmail evolves over time, so please refer to
the "Language" dropdown in the
[Gmail settings](https://mail.google.com/mail/u/0/#settings/general)
for all available options, as described in the
[language settings help article](https://support.google.com/mail/answer/17091).

The following table describes a rough sample of potential language values:

| Language (in English) | Language (as displayed in Gmail settings) | Language Tag (RFC 3066) |
| --- | --- | --- |
| Afrikaans | Afrikaans | `af` |
| Azerbaijani | Azərbaycanca | `az` |
| Indonesian | Bahasa Indonesia | `id` |
| Malay | Bahasa Melayu | `ms` |
| Catalan | Català | `ca` |
| Czech | Český | `cs` |
| Welsh | Cymraeg | `cy` |
| Danish | Dansk | `da` |
| German | Deutsch | `de` |
| Estonian | Eesti keel | `et` |
| English (United Kingdom) | English (UK) | `en-GB` |
| English | English (US) | `en` |
| Spanish | Español | `es` |
| Spanish (Latin America and the Caribbean) | Español (Latinoamerica) | `es-419` |
| Basque | Euskara | `eu` |
| Filipino | Filipino | `fil` |
| French | Français | `fr` |
| French (Canada) | Français (Canada) | `fr-CA` |
| Irish | Gaeilge | `ga` |
| Gallegan | Galego | `gl` |
| Croatian | Hrvatski | `hr` |
| Italian | Italiano | `it` |
| Zulu | IsiZulu | `zu` |
| Icelandic | Íslenska | `is` |
| Swahili | Kiswahili | `sw` |
| Latvian | Latviešu | `lv` |
| Lithuanian | Lietuvių | `lt` |
| Hungarian | Magyar | `hu` |
| Norwegian | Norsk (Bokmål) | `no` |
| Dutch | Nederlands | `nl` |
| Polish | Polski | `pl` |
| Portuguese (Brazil) | Português (Brasil) | `pt-BR` |
| Portuguese (Portugal) | Português (Portugal) | `pt-PT` |
| Romanian | Română | `ro` |
| Slovak | Slovenský | `sk` |
| Slovenian | Slovenščina | `sl` |
| Finnish | Suomi | `fi` |
| Swedish | Svenska | `sv` |
| Vietnamese | Tiếng Việt | `vi` |
| Turkish | Türkçe | `tr` |
| Greek | Ελληνικά | `el` |
| Bulgarian | Български | `bg` |
| Mongolian | Монгол | `mn` |
| Russian | Русский | `ru` |
| Serbian | Српски | `sr` |
| Ukrainian | Українська | `uk` |
| Armenian | Հայերեն | `hy` |
| Hebrew | עברית | `he` |
| Urdu | اردو | `ur` |
| Arabic | العربية | `ar` |
| Persian | فارسی | `fa` |
| Nepali | नेपाली (Nepali) | `ne` |
| Marathi | मराठी | `mr` |
| Hindi | हिन्दी | `hi` |
| Bengali | বাংলা | `bn` |
| Gujarati | ગુજરાતી | `gu` |
| Tamil | தமிழ் | `ta` |
| Telugu | తెలుగు | `te` |
| Kannada | ಕನ್ನಡ | `kn` |
| Malayalam | മലയാളം | `ml` |
| Sinhalese | සිංහල (Sinhala) | `si` |
| Thai | ภาษาไทย | `th` |
| Lao | ພາສາລາວ (Lao) | `lo` |
| Burmese | မြန်မာဘာသာ (Myanmar language (Burmese)) | `my` |
| Georgian | ქართული | `ka` |
| Amharic | አማርኛ (Amharic) | `am` |
| Cherokee | ᏣᎳᎩ (Cherokee) | `chr` |
| Khmer | ភាសាខ្មែរ (Khmer) | `km` |
| Chinese (Hong Kong) | 中文 (香港) | `zh-HK` |
| Chinese (China) | 中文 (简体) | `zh-CN` |
| Chinese (Taiwan) | 中文 (繁體) | `zh-TW` |
| Japanese | 日本語 | `ja` |
| Korean | 한국어 | `ko` |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/ConfirmAction

Send feedback

# ConfirmAction Stay organized with collections Save and categorize content based on your preferences.

Type name: [ConfirmAction](/workspace/gmail/markup/reference/types/ConfirmAction)

Extends [Action](/workspace/gmail/markup/reference/types/Action) or [InformAction](/workspace/gmail/markup/reference/types/InformAction)

| Name | Type | Description |
| --- | --- | --- |
| confirmed | [Thing](/workspace/gmail/markup/reference/types/Thing) | The thing that is confirmed. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/ParentAudience

Send feedback

# ParentAudience Stay organized with collections Save and categorize content based on your preferences.

Type name: [ParentAudience](/workspace/gmail/markup/reference/types/ParentAudience)

Extends [PeopleAudience](/workspace/gmail/markup/reference/types/PeopleAudience)

| Name | Type | Description |
| --- | --- | --- |
| childMaxAge | [Number](/workspace/gmail/markup/reference/types/Number) | Maximal age of the child. |
| childMinAge | [Number](/workspace/gmail/markup/reference/types/Number) | Minimal age of the child. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/postmaster/reference/rest/v2beta/domainStats

Send feedback

# REST Resource: domainStats Stay organized with collections Save and categorize content based on your preferences.

* [Resource](#RESOURCE_REPRESENTATION)
* [Methods](#METHODS_SUMMARY)

## Resource

There is no persistent data associated with this resource.

| Methods | |
| --- | --- |
| `batchQuery` | **Developer Preview:** Available as part of the [Google Workspace Developer Preview Program](https://developers.google.com/workspace/preview), which grants early access to certain features. Executes a batch of QueryDomainStats requests for multiple domains. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/AdministrativeArea

Send feedback

# AdministrativeArea Stay organized with collections Save and categorize content based on your preferences.

Type name: [AdministrativeArea](/workspace/gmail/markup/reference/types/AdministrativeArea)

Extends [Place](/workspace/gmail/markup/reference/types/Place)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/SaleEvent

Send feedback

# SaleEvent Stay organized with collections Save and categorize content based on your preferences.

Type name: [SaleEvent](/workspace/gmail/markup/reference/types/SaleEvent)

Extends [Event](/workspace/gmail/markup/reference/types/Event)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/ListenAction

Send feedback

# ListenAction Stay organized with collections Save and categorize content based on your preferences.

Type name: [ListenAction](/workspace/gmail/markup/reference/types/ListenAction)

Extends [ConsumeAction](/workspace/gmail/markup/reference/types/ConsumeAction)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/DanceEvent

Send feedback

# DanceEvent Stay organized with collections Save and categorize content based on your preferences.

Type name: [DanceEvent](/workspace/gmail/markup/reference/types/DanceEvent)

Extends [Event](/workspace/gmail/markup/reference/types/Event)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/SubscribeAction

Send feedback

# SubscribeAction Stay organized with collections Save and categorize content based on your preferences.

Type name: [SubscribeAction](/workspace/gmail/markup/reference/types/SubscribeAction)

Extends [InteractAction](/workspace/gmail/markup/reference/types/InteractAction)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/MusicStore

Send feedback

# MusicStore Stay organized with collections Save and categorize content based on your preferences.

Type name: [MusicStore](/workspace/gmail/markup/reference/types/MusicStore)

Extends [Store](/workspace/gmail/markup/reference/types/Store)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/Recipe

Send feedback

# Recipe Stay organized with collections Save and categorize content based on your preferences.

Type name: [Recipe](/workspace/gmail/markup/reference/types/Recipe)

Extends [CreativeWork](/workspace/gmail/markup/reference/types/CreativeWork)

| Name | Type | Description |
| --- | --- | --- |
| cookingMethod | [Text](/workspace/gmail/markup/reference/types/Text) | The method of cooking, such as Frying, Steaming, ... |
| cookTime | [Duration](/workspace/gmail/markup/reference/types/Duration) | The time it takes to actually cook the dish, in [ISO 8601 duration format](http://en.wikipedia.org/wiki/ISO_8601). |
| ingredients | [Text](/workspace/gmail/markup/reference/types/Text) | An ingredient used in the recipe. |
| nutrition | [NutritionInformation](/workspace/gmail/markup/reference/types/NutritionInformation) | Nutrition information about the recipe. |
| prepTime | [Duration](/workspace/gmail/markup/reference/types/Duration) | The length of time it takes to prepare the recipe, in [ISO 8601 duration format](http://en.wikipedia.org/wiki/ISO_8601). |
| recipeCategory | [Text](/workspace/gmail/markup/reference/types/Text) | The category of the recipe—for example, appetizer, entree, etc. |
| recipeCuisine | [Text](/workspace/gmail/markup/reference/types/Text) | The cuisine of the recipe (for example, French or Ethiopian). |
| recipeInstructions | [Text](/workspace/gmail/markup/reference/types/Text) | The steps to make the dish. |
| recipeYield | [Text](/workspace/gmail/markup/reference/types/Text) | The quantity produced by the recipe (for example, number of people served, number of servings, etc). |
| totalTime | [Duration](/workspace/gmail/markup/reference/types/Duration) | The total time it takes to prepare and cook the recipe, in [ISO 8601 duration format](http://en.wikipedia.org/wiki/ISO_8601). |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.settings.cse.identities

Send feedback

# REST Resource: users.settings.cse.identities Stay organized with collections Save and categorize content based on your preferences.

* [Resource: CseIdentity](#CseIdentity)
  + [JSON representation](#CseIdentity.SCHEMA_REPRESENTATION)
* [SignAndEncryptKeyPairs](#SignAndEncryptKeyPairs)
  + [JSON representation](#SignAndEncryptKeyPairs.SCHEMA_REPRESENTATION)
* [Methods](#METHODS_SUMMARY)

## Resource: CseIdentity

The client-side encryption (CSE) configuration for the email address of an authenticated user. Gmail uses CSE configurations to save drafts of client-side encrypted email messages, and to sign and send encrypted email messages.

For administrators managing identities and keypairs for users in their organization, requests require authorization with a [service account](https://developers.google.com/identity/protocols/OAuth2ServiceAccount) that has [domain-wide delegation authority](https://developers.google.com/identity/protocols/OAuth2ServiceAccount#delegatingauthority) to impersonate users with the `https://www.googleapis.com/auth/gmail.settings.basic` scope.

For users managing their own identities and keypairs, requests require [hardware key encryption](https://support.google.com/a/answer/14153163) turned on and configured.

| JSON representation |
| --- |
| ``` {   "emailAddress": string,    // Union field key_pair_configuration can be only one of the following:   "primaryKeyPairId": string,   "signAndEncryptKeyPairs": {     object (SignAndEncryptKeyPairs)   }   // End of list of possible types for union field key_pair_configuration. } ``` |

| Fields | |
| --- | --- |
| `emailAddress` | `string`  The email address for the sending identity. The email address must be the primary email address of the authenticated user. |
| Union field `key_pair_configuration`.  `key_pair_configuration` can be only one of the following: | |
| `primaryKeyPairId` | `string`  If a key pair is associated, the ID of the key pair, `CseKeyPair`. |
| `signAndEncryptKeyPairs` | `object (SignAndEncryptKeyPairs)`  The configuration of a CSE identity that uses different key pairs for signing and encryption. |

## SignAndEncryptKeyPairs

The configuration of a CSE identity that uses different key pairs for signing and encryption.

| JSON representation |
| --- |
| ``` {   "signingKeyPairId": string,   "encryptionKeyPairId": string } ``` |

| Fields | |
| --- | --- |
| `signingKeyPairId` | `string`  The ID of the `CseKeyPair` that signs outgoing mail. |
| `encryptionKeyPairId` | `string`  The ID of the `CseKeyPair` that encrypts signed outgoing mail. |

| Methods | |
| --- | --- |
| `create` | Creates and configures a client-side encryption identity that's authorized to send mail from the user account. |
| `delete` | Deletes a client-side encryption identity. |
| `get` | Retrieves a client-side encryption identity configuration. |
| `list` | Lists the client-side encrypted identities for an authenticated user. |
| `patch` | Associates a different key pair with an existing client-side encryption identity. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/Hospital

Send feedback

# Hospital Stay organized with collections Save and categorize content based on your preferences.

Type name: [Hospital](/workspace/gmail/markup/reference/types/Hospital)

Extends [CivicStructure](/workspace/gmail/markup/reference/types/CivicStructure), [EmergencyService](/workspace/gmail/markup/reference/types/EmergencyService) or [MedicalOrganization](/workspace/gmail/markup/reference/types/MedicalOrganization)

| Name | Type | Description |
| --- | --- | --- |
| availableService | [MedicalProcedure](/workspace/gmail/markup/reference/types/MedicalProcedure), [MedicalTest](/workspace/gmail/markup/reference/types/MedicalTest) or [MedicalTherapy](/workspace/gmail/markup/reference/types/MedicalTherapy) | A medical service available from this provider. |
| medicalSpecialty | [MedicalSpecialty](/workspace/gmail/markup/reference/types/MedicalSpecialty) | A medical specialty of the provider. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/MedicalProcedure

Send feedback

# MedicalProcedure Stay organized with collections Save and categorize content based on your preferences.

Type name: [MedicalProcedure](/workspace/gmail/markup/reference/types/MedicalProcedure)

Extends [MedicalEntity](/workspace/gmail/markup/reference/types/MedicalEntity)

| Name | Type | Description |
| --- | --- | --- |
| followup | [Text](/workspace/gmail/markup/reference/types/Text) | Typical or recommended followup care after the procedure is performed. |
| howPerformed | [Text](/workspace/gmail/markup/reference/types/Text) | How the procedure is performed. |
| preparation | [Text](/workspace/gmail/markup/reference/types/Text) | Typical preparation that a patient must undergo before having the procedure performed. |
| procedureType | [MedicalProcedureType](/workspace/gmail/markup/reference/types/MedicalProcedureType) | The type of procedure, for example Surgical, Noninvasive, or Percutaneous. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/Physician

Send feedback

# Physician Stay organized with collections Save and categorize content based on your preferences.

Type name: [Physician](/workspace/gmail/markup/reference/types/Physician)

Extends [MedicalOrganization](/workspace/gmail/markup/reference/types/MedicalOrganization)

| Name | Type | Description |
| --- | --- | --- |
| availableService | [MedicalProcedure](/workspace/gmail/markup/reference/types/MedicalProcedure), [MedicalTest](/workspace/gmail/markup/reference/types/MedicalTest) or [MedicalTherapy](/workspace/gmail/markup/reference/types/MedicalTherapy) | A medical service available from this provider. |
| hospitalAffiliation | [Hospital](/workspace/gmail/markup/reference/types/Hospital) | A hospital with which the physician or office is affiliated. |
| medicalSpecialty | [MedicalSpecialty](/workspace/gmail/markup/reference/types/MedicalSpecialty) | A medical specialty of the provider. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/ListItem

Send feedback

# ListItem Stay organized with collections Save and categorize content based on your preferences.

Type name: [ListItem](/workspace/gmail/markup/reference/types/ListItem)

Extends [Intangible](/workspace/gmail/markup/reference/types/Intangible)

| Name | Type | Description |
| --- | --- | --- |
| item | [Thing](/workspace/gmail/markup/reference/types/Thing) | An entity represented by an entry in a list (e.g. an 'artist' in a list of 'artists')’. |
| nextItem | [ListItem](/workspace/gmail/markup/reference/types/ListItem) | A link to the ListItem that follows the current one. |
| position | [Integer](/workspace/gmail/markup/reference/types/Integer) or [Text](/workspace/gmail/markup/reference/types/Text) | The position of an item in a series or sequence of items. |
| previousItem | [ListItem](/workspace/gmail/markup/reference/types/ListItem) | A link to the ListItem that preceeds the current one. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/DeliveryMethod

Send feedback

# DeliveryMethod Stay organized with collections Save and categorize content based on your preferences.

Type name: [DeliveryMethod](/workspace/gmail/markup/reference/types/DeliveryMethod)

Extends [Enumeration](/workspace/gmail/markup/reference/types/Enumeration)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/Mosque

Send feedback

# Mosque Stay organized with collections Save and categorize content based on your preferences.

Type name: [Mosque](/workspace/gmail/markup/reference/types/Mosque)

Extends [PlaceOfWorship](/workspace/gmail/markup/reference/types/PlaceOfWorship)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/EducationEvent

Send feedback

# EducationEvent Stay organized with collections Save and categorize content based on your preferences.

Type name: [EducationEvent](/workspace/gmail/markup/reference/types/EducationEvent)

Extends [Event](/workspace/gmail/markup/reference/types/Event)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/DiagnosticProcedure

Send feedback

# DiagnosticProcedure Stay organized with collections Save and categorize content based on your preferences.

Type name: [DiagnosticProcedure](/workspace/gmail/markup/reference/types/DiagnosticProcedure)

Extends [MedicalProcedure](/workspace/gmail/markup/reference/types/MedicalProcedure) or [MedicalTest](/workspace/gmail/markup/reference/types/MedicalTest)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/QAPage

Send feedback

# QAPage Stay organized with collections Save and categorize content based on your preferences.

Type name: [QAPage](/workspace/gmail/markup/reference/types/QAPage)

Extends [WebPage](/workspace/gmail/markup/reference/types/WebPage)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/FollowAction

Send feedback

# FollowAction Stay organized with collections Save and categorize content based on your preferences.

Type name: [FollowAction](/workspace/gmail/markup/reference/types/FollowAction)

Extends [InteractAction](/workspace/gmail/markup/reference/types/InteractAction)

| Name | Type | Description |
| --- | --- | --- |
| followee | [Organization](/workspace/gmail/markup/reference/types/Organization) or [Person](/workspace/gmail/markup/reference/types/Person) | A sub property of object. The person or organization being followed. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/GeneralContractor

Send feedback

# GeneralContractor Stay organized with collections Save and categorize content based on your preferences.

Type name: [GeneralContractor](/workspace/gmail/markup/reference/types/GeneralContractor)

Extends [HomeAndConstructionBusiness](/workspace/gmail/markup/reference/types/HomeAndConstructionBusiness) or [ProfessionalService](/workspace/gmail/markup/reference/types/ProfessionalService)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.settings/getPop

Send feedback

# Method: users.settings.getPop Stay organized with collections Save and categorize content based on your preferences.

* [HTTP request](#body.HTTP_TEMPLATE)
* [Path parameters](#body.PATH_PARAMETERS)
* [Request body](#body.request_body)
* [Response body](#body.response_body)
* [Authorization scopes](#body.aspect)
* [Try it!](#try-it)

Gets POP settings.

### HTTP request

`GET https://gmail.googleapis.com/gmail/v1/users/{userId}/settings/pop`

The URL uses [gRPC Transcoding](https://google.aip.dev/127) syntax.

### Path parameters

| Parameters | |
| --- | --- |
| `userId` | `string`  User's email address. The special value "me" can be used to indicate the authenticated user. |

### Request body

The request body must be empty.

### Response body

If successful, the response body contains an instance of `PopSettings`.

### Authorization scopes

Requires one of the following OAuth scopes:

* `https://www.googleapis.com/auth/gmail.settings.basic`
* `https://mail.google.com/`
* `https://www.googleapis.com/auth/gmail.modify`
* `https://www.googleapis.com/auth/gmail.readonly`

For more information, see the [OAuth 2.0 Overview](/identity/protocols/OAuth2).




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/Article

Send feedback

# Markup Types Stay organized with collections Save and categorize content based on your preferences.

### Actions

* [One-Click Action](/workspace/gmail/markup/reference/one-click-action)
* [Go-To Action](/workspace/gmail/markup/reference/go-to-action)

### Orders and invoices

* [Order](/workspace/gmail/markup/reference/order)
* [Parcel Delivery](/workspace/gmail/markup/reference/parcel-delivery)
* [Invoice](/workspace/gmail/markup/reference/invoice)

### Reservations

* [Bus Reservation](/workspace/gmail/markup/reference/bus-reservation)
* [Event Reservation](/workspace/gmail/markup/reference/event-reservation)
* [Flight Reservation](/workspace/gmail/markup/reference/flight-reservation)
* [Hotel Reservation](/workspace/gmail/markup/reference/hotel-reservation)
* [Rental Car Reservation](/workspace/gmail/markup/reference/rental-car)
* [Restaurant Reservation](/workspace/gmail/markup/reference/restaurant-reservation)
* [Train Reservation](/workspace/gmail/markup/reference/train-reservation)

## Base Types

* [Action](/workspace/gmail/markup/reference/types/Action)
* [ActionHandler](/workspace/gmail/markup/reference/types/ActionHandler)
* [Airline](/workspace/gmail/markup/reference/types/Airline)
* [Airport](/workspace/gmail/markup/reference/types/Airport)
* [AutoRental](/workspace/gmail/markup/reference/types/AutoRental)
* [AutomotiveBusiness](/workspace/gmail/markup/reference/types/AutomotiveBusiness)
* [Boolean](/workspace/gmail/markup/reference/types/Boolean)
* [Brand](/workspace/gmail/markup/reference/types/Brand)
* [BusStation](/workspace/gmail/markup/reference/types/BusStation)
* [BusStop](/workspace/gmail/markup/reference/types/BusStop)
* [BusTrip](/workspace/gmail/markup/reference/types/BusTrip)
* [Car](/workspace/gmail/markup/reference/types/Car)
* [CheckInAction](/workspace/gmail/markup/reference/types/CheckInAction)
* [CivicStructure](/workspace/gmail/markup/reference/types/CivicStructure)
* [Class](/workspace/gmail/markup/reference/types/Class)
* [Comment](/workspace/gmail/markup/reference/types/Comment)
* [ConfirmAction](/workspace/gmail/markup/reference/types/ConfirmAction)
* [ContactPoint](/workspace/gmail/markup/reference/types/ContactPoint)
* [Country](/workspace/gmail/markup/reference/types/Country)
* [CreativeWork](/workspace/gmail/markup/reference/types/CreativeWork)
* [CreditCard](/workspace/gmail/markup/reference/types/CreditCard)
* [DateTime](/workspace/gmail/markup/reference/types/DateTime)
* [DeliveryChargeSpecification](/workspace/gmail/markup/reference/types/DeliveryChargeSpecification)
* [DeliveryEvent](/workspace/gmail/markup/reference/types/DeliveryEvent)
* [DeliveryMethod](/workspace/gmail/markup/reference/types/DeliveryMethod)
* [EmailMessage](/workspace/gmail/markup/reference/types/EmailMessage)
* [Event](/workspace/gmail/markup/reference/types/Event)
* [EventReservation](/workspace/gmail/markup/reference/types/EventReservation)
* [Flight](/workspace/gmail/markup/reference/types/Flight)
* [FlightReservation](/workspace/gmail/markup/reference/types/FlightReservation)
* [FoodEstablishment](/workspace/gmail/markup/reference/types/FoodEstablishment)
* [FoodEstablishmentReservation](/workspace/gmail/markup/reference/types/FoodEstablishmentReservation)
* [GeoShape](/workspace/gmail/markup/reference/types/GeoShape)
* [HttpActionHandler](/workspace/gmail/markup/reference/types/HttpActionHandler)
* [HttpRequestMethod](/workspace/gmail/markup/reference/types/HttpRequestMethod)
* [Intangible](/workspace/gmail/markup/reference/types/Intangible)
* [Invoice](/workspace/gmail/markup/reference/types/Invoice)
* [LocalBusiness](/workspace/gmail/markup/reference/types/LocalBusiness)
* [LockerDelivery](/workspace/gmail/markup/reference/types/LockerDelivery)
* [LodgingBusiness](/workspace/gmail/markup/reference/types/LodgingBusiness)
* [LodgingReservation](/workspace/gmail/markup/reference/types/LodgingReservation)
* [Movie](/workspace/gmail/markup/reference/types/Movie)
* [MusicEvent](/workspace/gmail/markup/reference/types/MusicEvent)
* [Number](/workspace/gmail/markup/reference/types/Number)
* [Offer](/workspace/gmail/markup/reference/types/Offer)
* [OfferItemCondition](/workspace/gmail/markup/reference/types/OfferItemCondition)
* [Order](/workspace/gmail/markup/reference/types/Order)
* [OrderStatus](/workspace/gmail/markup/reference/types/OrderStatus)
* [Organization](/workspace/gmail/markup/reference/types/Organization)
* [ParcelDelivery](/workspace/gmail/markup/reference/types/ParcelDelivery)
* [ParcelService](/workspace/gmail/markup/reference/types/ParcelService)
* [PaymentMethod](/workspace/gmail/markup/reference/types/PaymentMethod)
* [Person](/workspace/gmail/markup/reference/types/Person)
* [Place](/workspace/gmail/markup/reference/types/Place)
* [PostalAddress](/workspace/gmail/markup/reference/types/PostalAddress)
* [PriceSpecification](/workspace/gmail/markup/reference/types/PriceSpecification)
* [Product](/workspace/gmail/markup/reference/types/Product)
* [ProgramMembership](/workspace/gmail/markup/reference/types/ProgramMembership)
* [Property](/workspace/gmail/markup/reference/types/Property)
* [QuantitativeValue](/workspace/gmail/markup/reference/types/QuantitativeValue)
* [Rating](/workspace/gmail/markup/reference/types/Rating)
* [RentalCarReservation](/workspace/gmail/markup/reference/types/RentalCarReservation)
* [Reservation](/workspace/gmail/markup/reference/types/Reservation)
* [ReservationPackage](/workspace/gmail/markup/reference/types/ReservationPackage)
* [ReservationStatus](/workspace/gmail/markup/reference/types/ReservationStatus)
* [SaveAction](/workspace/gmail/markup/reference/types/SaveAction)
* [Seat](/workspace/gmail/markup/reference/types/Seat)
* [ShareAction](/workspace/gmail/markup/reference/types/ShareAction)
* [SportsEvent](/workspace/gmail/markup/reference/types/SportsEvent)
* [StructuredValue](/workspace/gmail/markup/reference/types/StructuredValue)
* [Text](/workspace/gmail/markup/reference/types/Text)
* [Thing](/workspace/gmail/markup/reference/types/Thing)
* [Ticket](/workspace/gmail/markup/reference/types/Ticket)
* [TrackAction](/workspace/gmail/markup/reference/types/TrackAction)
* [TrainStation](/workspace/gmail/markup/reference/types/TrainStation)
* [TrainTrip](/workspace/gmail/markup/reference/types/TrainTrip)
* [URL](/workspace/gmail/markup/reference/types/URL)
* [ViewAction](/workspace/gmail/markup/reference/types/ViewAction)




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/CollectionPage

Send feedback

# CollectionPage Stay organized with collections Save and categorize content based on your preferences.

Type name: [CollectionPage](/workspace/gmail/markup/reference/types/CollectionPage)

Extends [WebPage](/workspace/gmail/markup/reference/types/WebPage)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.settings.filters/create

Send feedback

# Method: users.settings.filters.create Stay organized with collections Save and categorize content based on your preferences.

* [HTTP request](#body.HTTP_TEMPLATE)
* [Path parameters](#body.PATH_PARAMETERS)
* [Request body](#body.request_body)
* [Response body](#body.response_body)
* [Authorization scopes](#body.aspect)
* [Try it!](#try-it)

Creates a filter. Note: you can only create a maximum of 1,000 filters.

### HTTP request

`POST https://gmail.googleapis.com/gmail/v1/users/{userId}/settings/filters`

The URL uses [gRPC Transcoding](https://google.aip.dev/127) syntax.

### Path parameters

| Parameters | |
| --- | --- |
| `userId` | `string`  User's email address. The special value "me" can be used to indicate the authenticated user. |

### Request body

The request body contains an instance of `Filter`.

### Response body

If successful, the response body contains a newly created instance of `Filter`.

### Authorization scopes

Requires the following OAuth scope:

* `https://www.googleapis.com/auth/gmail.settings.basic`

For more information, see the [OAuth 2.0 Overview](/identity/protocols/OAuth2).




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/TherapeuticProcedure

Send feedback

# TherapeuticProcedure Stay organized with collections Save and categorize content based on your preferences.

Type name: [TherapeuticProcedure](/workspace/gmail/markup/reference/types/TherapeuticProcedure)

Extends [MedicalProcedure](/workspace/gmail/markup/reference/types/MedicalProcedure) or [MedicalTherapy](/workspace/gmail/markup/reference/types/MedicalTherapy)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/postmaster/reference/rest/v2/domainStats/batchQuery

Send feedback

# Method: domainStats.batchQuery Stay organized with collections Save and categorize content based on your preferences.

* [HTTP request](#body.HTTP_TEMPLATE)
* [Request body](#body.request_body)
  + [JSON representation](#body.request_body.SCHEMA_REPRESENTATION)
* [Response body](#body.response_body)
  + [JSON representation](#body.BatchQueryDomainStatsResponse.SCHEMA_REPRESENTATION)
* [Authorization scopes](#body.aspect)
* [QueryDomainStatsRequest](#QueryDomainStatsRequest)
  + [JSON representation](#QueryDomainStatsRequest.SCHEMA_REPRESENTATION)
* [BatchQueryDomainStatsResult](#BatchQueryDomainStatsResult)
  + [JSON representation](#BatchQueryDomainStatsResult.SCHEMA_REPRESENTATION)
* [Status](#Status)
  + [JSON representation](#Status.SCHEMA_REPRESENTATION)
* [Try it!](#try-it)

Executes a batch of QueryDomainStats requests for multiple domains. Returns PERMISSION\_DENIED if you don't have permission to access DomainStats for any of the requested domains.

### HTTP request

`POST https://gmailpostmastertools.googleapis.com/v2/domainStats:batchQuery`

The URL uses [gRPC Transcoding](https://google.aip.dev/127) syntax.

### Request body

The request body contains data with the following structure:

| JSON representation |
| --- |
| ``` {   "requests": [     {       object (QueryDomainStatsRequest)     }   ] } ``` |

| Fields | |
| --- | --- |
| `requests[]` | `object (QueryDomainStatsRequest)`  Required. A list of individual query requests. Each request can be for a different domain. A maximum of 100 requests can be included in a single batch. |

### Response body

Response message for domainStats.batchQuery.

If successful, the response body contains data with the following structure:

| JSON representation |
| --- |
| ``` {   "results": [     {       object (BatchQueryDomainStatsResult)     }   ] } ``` |

| Fields | |
| --- | --- |
| `results[]` | `object (BatchQueryDomainStatsResult)`  A list of responses, one for each query in the BatchQueryDomainStatsRequest. The order of responses will correspond to the order of requests. |

### Authorization scopes

Requires one of the following OAuth scopes:

* `https://www.googleapis.com/auth/postmaster`
* `https://www.googleapis.com/auth/postmaster.traffic.readonly`

For more information, see the [Authorization guide](https://developers.google.com/workspace/guides/configure-oauth-consent).

## QueryDomainStatsRequest

Request message for QueryDomainStats.

| JSON representation |
| --- |
| ``` {   "parent": string,   "metricDefinitions": [     {       object (MetricDefinition)     }   ],   "timeQuery": {     object (TimeQuery)   },   "pageSize": integer,   "pageToken": string,   "aggregationGranularity": enum (AggregationGranularity) } ``` |

| Fields | |
| --- | --- |
| `parent` | `string`  Required. The parent resource name where the stats are queried. Format: domains/{domain} |
| `metricDefinitions[]` | `object (MetricDefinition)`  Required. The specific metrics to query. You can define a custom name for each metric, which will be used in the response. |
| `timeQuery` | `object (TimeQuery)`  Required. The time range or specific dates for which to retrieve the metrics. |
| `pageSize` | `integer`  Optional. The maximum number of DomainStats resources to return in the response. The server may return fewer than this value. If unspecified, a default value of 10 will be used. The maximum value is 200. |
| `pageToken` | `string`  Optional. The nextPageToken value returned from a previous List request, if any. If the aggregation granularity is DAILY, the page token will be the encoded date + "/" + metric name. If the aggregation granularity is OVERALL, the page token will be the encoded metric name. |
| `aggregationGranularity` | `enum (AggregationGranularity)`  Optional. The granularity at which to aggregate the statistics. If unspecified, defaults to DAILY. |

## BatchQueryDomainStatsResult

Represents the result of a single QueryDomainStatsRequest within a batch.

| JSON representation |
| --- |
| ``` {    // Union field result can be only one of the following:   "response": {     object (QueryDomainStatsResponse)   },   "error": {     object (Status)   }   // End of list of possible types for union field result. } ``` |

| Fields | |
| --- | --- |
| Union field `result`. The result of the individual query. `result` can be only one of the following: | |
| `response` | `object (QueryDomainStatsResponse)`  The successful response for the individual query. |
| `error` | `object (Status)`  The error status if the individual query failed. |

## Status

The `Status` type defines a logical error model that is suitable for different programming environments, including REST APIs and RPC APIs. It is used by [gRPC](https://github.com/grpc). Each `Status` message contains three pieces of data: error code, error message, and error details.

You can find out more about this error model and how to work with it in the [API Design Guide](https://cloud.google.com/apis/design/errors).

| JSON representation |
| --- |
| ``` {   "code": integer,   "message": string,   "details": [     {       "@type": string,       field1: ...,       ...     }   ] } ``` |

| Fields | |
| --- | --- |
| `code` | `integer`  The status code, which should be an enum value of `google.rpc.Code`. |
| `message` | `string`  A developer-facing error message, which should be in English. Any user-facing error message should be localized and sent in the `google.rpc.Status.details` field, or localized by the client. |
| `details[]` | `object`  A list of messages that carry the error details. There is a common set of message types for APIs to use. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/trash

Send feedback

# Method: users.messages.trash Stay organized with collections Save and categorize content based on your preferences.

* [HTTP request](#body.HTTP_TEMPLATE)
* [Path parameters](#body.PATH_PARAMETERS)
* [Request body](#body.request_body)
* [Response body](#body.response_body)
* [Authorization scopes](#body.aspect)
* [Try it!](#try-it)

Moves the specified message to the trash.

### HTTP request

`POST https://gmail.googleapis.com/gmail/v1/users/{userId}/messages/{id}/trash`

The URL uses [gRPC Transcoding](https://google.aip.dev/127) syntax.

### Path parameters

| Parameters | |
| --- | --- |
| `userId` | `string`  The user's email address. The special value `me` can be used to indicate the authenticated user. |
| `id` | `string`  The ID of the message to Trash. |

### Request body

The request body must be empty.

### Response body

If successful, the response body contains an instance of `Message`.

### Authorization scopes

Requires one of the following OAuth scopes:

* `https://mail.google.com/`
* `https://www.googleapis.com/auth/gmail.modify`

For more information, see the [OAuth 2.0 Overview](/identity/protocols/OAuth2).




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/api/v1/reference/users/settings/updateLanguage

Send feedback

# Method: users.settings.updateLanguage Stay organized with collections Save and categorize content based on your preferences.

* [HTTP request](#body.HTTP_TEMPLATE)
* [Path parameters](#body.PATH_PARAMETERS)
* [Request body](#body.request_body)
* [Response body](#body.response_body)
* [Authorization scopes](#body.aspect)
* [Try it!](#try-it)

Updates language settings.

If successful, the return object contains the `displayLanguage` that was saved for the user, which may differ from the value passed into the request. This is because the requested `displayLanguage` may not be directly supported by Gmail but have a close variant that is, and so the variant may be chosen and saved instead.

### HTTP request

`PUT https://gmail.googleapis.com/gmail/v1/users/{userId}/settings/language`

The URL uses [gRPC Transcoding](https://google.aip.dev/127) syntax.

### Path parameters

| Parameters | |
| --- | --- |
| `userId` | `string`  User's email address. The special value "me" can be used to indicate the authenticated user. |

### Request body

The request body contains an instance of `LanguageSettings`.

### Response body

If successful, the response body contains an instance of `LanguageSettings`.

### Authorization scopes

Requires the following OAuth scope:

* `https://www.googleapis.com/auth/gmail.settings.basic`

For more information, see the [OAuth 2.0 Overview](/identity/protocols/OAuth2).




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/Museum

Send feedback

# Museum Stay organized with collections Save and categorize content based on your preferences.

Type name: [Museum](/workspace/gmail/markup/reference/types/Museum)

Extends [CivicStructure](/workspace/gmail/markup/reference/types/CivicStructure)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/AnatomicalStructure

Send feedback

# AnatomicalStructure Stay organized with collections Save and categorize content based on your preferences.

Type name: [AnatomicalStructure](/workspace/gmail/markup/reference/types/AnatomicalStructure)

Extends [MedicalEntity](/workspace/gmail/markup/reference/types/MedicalEntity)

| Name | Type | Description |
| --- | --- | --- |
| associatedPathophysiology | [Text](/workspace/gmail/markup/reference/types/Text) | If applicable, a description of the pathophysiology associated with the anatomical system, including potential abnormal changes in the mechanical, physical, and biochemical functions of the system. |
| bodyLocation | [Text](/workspace/gmail/markup/reference/types/Text) | Location in the body of the anatomical structure. |
| connectedTo | [AnatomicalStructure](/workspace/gmail/markup/reference/types/AnatomicalStructure) | Other anatomical structures to which this structure is connected. |
| diagram | [ImageObject](/workspace/gmail/markup/reference/types/ImageObject) | An image containing a diagram that illustrates the structure and/or its component substructures and/or connections with other structures. |
| function | [Text](/workspace/gmail/markup/reference/types/Text) | Function of the anatomical structure. |
| partOfSystem | [AnatomicalSystem](/workspace/gmail/markup/reference/types/AnatomicalSystem) | The anatomical or organ system that this structure is part of. |
| relatedCondition | [MedicalCondition](/workspace/gmail/markup/reference/types/MedicalCondition) | A medical condition associated with this anatomy. |
| relatedTherapy | [MedicalTherapy](/workspace/gmail/markup/reference/types/MedicalTherapy) | A medical therapy related to this anatomy. |
| subStructure | [AnatomicalStructure](/workspace/gmail/markup/reference/types/AnatomicalStructure) | Component (sub-)structure(s) that comprise this anatomical structure. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/Bakery

Send feedback

# Bakery Stay organized with collections Save and categorize content based on your preferences.

Type name: [Bakery](/workspace/gmail/markup/reference/types/Bakery)

Extends [FoodEstablishment](/workspace/gmail/markup/reference/types/FoodEstablishment)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.settings/updateImap

Send feedback

# Method: users.settings.updateImap Stay organized with collections Save and categorize content based on your preferences.

* [HTTP request](#body.HTTP_TEMPLATE)
* [Path parameters](#body.PATH_PARAMETERS)
* [Request body](#body.request_body)
* [Response body](#body.response_body)
* [Authorization scopes](#body.aspect)
* [Try it!](#try-it)

Updates IMAP settings.

### HTTP request

`PUT https://gmail.googleapis.com/gmail/v1/users/{userId}/settings/imap`

The URL uses [gRPC Transcoding](https://google.aip.dev/127) syntax.

### Path parameters

| Parameters | |
| --- | --- |
| `userId` | `string`  User's email address. The special value "me" can be used to indicate the authenticated user. |

### Request body

The request body contains an instance of `ImapSettings`.

### Response body

If successful, the response body contains an instance of `ImapSettings`.

### Authorization scopes

Requires the following OAuth scope:

* `https://www.googleapis.com/auth/gmail.settings.basic`

For more information, see the [OAuth 2.0 Overview](/identity/protocols/OAuth2).




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/SellAction

Send feedback

# SellAction Stay organized with collections Save and categorize content based on your preferences.

Type name: [SellAction](/workspace/gmail/markup/reference/types/SellAction)

Extends [TradeAction](/workspace/gmail/markup/reference/types/TradeAction)

| Name | Type | Description |
| --- | --- | --- |
| buyer | [Person](/workspace/gmail/markup/reference/types/Person) | A sub property of participant. The participant/person/organization that bought the object. |
| warrantyPromise | [WarrantyPromise](/workspace/gmail/markup/reference/types/WarrantyPromise) | The warranty promise(s) included in the offer. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/WPFooter

Send feedback

# WPFooter Stay organized with collections Save and categorize content based on your preferences.

Type name: [WPFooter](/workspace/gmail/markup/reference/types/WPFooter)

Extends [WebPageElement](/workspace/gmail/markup/reference/types/WebPageElement)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.labels/delete

Send feedback

# Method: users.labels.delete Stay organized with collections Save and categorize content based on your preferences.

* [HTTP request](#body.HTTP_TEMPLATE)
* [Path parameters](#body.PATH_PARAMETERS)
* [Request body](#body.request_body)
* [Response body](#body.response_body)
* [Authorization scopes](#body.aspect)
* [Try it!](#try-it)

Immediately and permanently deletes the specified label and removes it from any messages and threads that it is applied to.

### HTTP request

`DELETE https://gmail.googleapis.com/gmail/v1/users/{userId}/labels/{id}`

The URL uses [gRPC Transcoding](https://google.aip.dev/127) syntax.

### Path parameters

| Parameters | |
| --- | --- |
| `userId` | `string`  The user's email address. The special value `me` can be used to indicate the authenticated user. |
| `id` | `string`  The ID of the label to delete. |

### Request body

The request body must be empty.

### Response body

If successful, the response body is an empty JSON object.

### Authorization scopes

Requires one of the following OAuth scopes:

* `https://mail.google.com/`
* `https://www.googleapis.com/auth/gmail.modify`
* `https://www.googleapis.com/auth/gmail.labels`

For more information, see the [OAuth 2.0 Overview](/identity/protocols/OAuth2).




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/SendAction

Send feedback

# SendAction Stay organized with collections Save and categorize content based on your preferences.

Type name: [SendAction](/workspace/gmail/markup/reference/types/SendAction)

Extends [TransferAction](/workspace/gmail/markup/reference/types/TransferAction)

| Name | Type | Description |
| --- | --- | --- |
| deliveryMethod | [DeliveryMethod](/workspace/gmail/markup/reference/types/DeliveryMethod) | A sub property of instrument. The method of delivery. |
| recipient | [Audience](/workspace/gmail/markup/reference/types/Audience), [Organization](/workspace/gmail/markup/reference/types/Organization) or [Person](/workspace/gmail/markup/reference/types/Person) | A sub property of participant. The participant who is at the receiving end of the action. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/NGO

Send feedback

# NGO Stay organized with collections Save and categorize content based on your preferences.

Type name: [NGO](/workspace/gmail/markup/reference/types/NGO)

Extends [Organization](/workspace/gmail/markup/reference/types/Organization)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/ReturnAction

Send feedback

# ReturnAction Stay organized with collections Save and categorize content based on your preferences.

Type name: [ReturnAction](/workspace/gmail/markup/reference/types/ReturnAction)

Extends [TransferAction](/workspace/gmail/markup/reference/types/TransferAction)

| Name | Type | Description |
| --- | --- | --- |
| recipient | [Audience](/workspace/gmail/markup/reference/types/Audience), [Organization](/workspace/gmail/markup/reference/types/Organization) or [Person](/workspace/gmail/markup/reference/types/Person) | A sub property of participant. The participant who is at the receiving end of the action. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/Winery

Send feedback

# Winery Stay organized with collections Save and categorize content based on your preferences.

Type name: [Winery](/workspace/gmail/markup/reference/types/Winery)

Extends [FoodEstablishment](/workspace/gmail/markup/reference/types/FoodEstablishment)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/LodgingReservation

Send feedback

# LodgingReservation Stay organized with collections Save and categorize content based on your preferences.

Type name: [LodgingReservation](/workspace/gmail/markup/reference/types/LodgingReservation)

Extends [Reservation](/workspace/gmail/markup/reference/types/Reservation)

| Name | Type | Description |
| --- | --- | --- |
| **bookingAgent** | [Person](/workspace/gmail/markup/reference/types/Person) or [Organization](/workspace/gmail/markup/reference/types/Organization) | Booking agent or agency. Also accepts a string (e.g. ""). |
| bookingAgent.**name** | [Text](/workspace/gmail/markup/reference/types/Text) | Name of the agent/service. |
| bookingAgent.**url** | [URL](/workspace/gmail/markup/reference/types/URL) | Website of the agent/service. |
| **bookingTime** | [DateTime](/workspace/gmail/markup/reference/types/DateTime) | Date the reservation was made. |
| **cancelReservationUrl** | [URL](/workspace/gmail/markup/reference/types/URL) | Web page where reservation can be cancelled. |
| **checkinDate**  **(Required)** | [DateTime](/workspace/gmail/markup/reference/types/DateTime) | Checkin time. |
| **checkoutDate**  **(Required)** | [DateTime](/workspace/gmail/markup/reference/types/DateTime) | Checkout time. |
| **checkinUrl** | [URL](/workspace/gmail/markup/reference/types/URL) | Web page where the lodger can check in. |
| **confirmReservationUrl** | [URL](/workspace/gmail/markup/reference/types/URL) | Web page where reservation can be confirmed. |
| **lodgingUnitDescription** | [Text](/workspace/gmail/markup/reference/types/Text) | Textual description of the unit type (including suite vs. room, size of bed, etc.). |
| **modifiedTime** | [DateTime](/workspace/gmail/markup/reference/types/DateTime) | (recommended for Confirmation Cards/Search Answers) Time the reservation was last modified. |
| **modifyReservationUrl** | [URL](/workspace/gmail/markup/reference/types/URL) | (recommended for Confirmation Cards/Search Answers) Web page where reservation can be modified. |
| **numAdults** | [Number](/workspace/gmail/markup/reference/types/Number) | Number of adults who will be staying in the lodging unit. |
| **numChildren** | [Number](/workspace/gmail/markup/reference/types/Number) | Number of children who will be staying in the lodging unit. |
| **price** | [Text](/workspace/gmail/markup/reference/types/Text) | Total price of the LodgingReservation. |
| **priceCurrency** | [Text](/workspace/gmail/markup/reference/types/Text) | The currency (in 3-letter ISO 4217 format) of the LodgingReservation's price. |
| **programMembership** | [ProgramMembership](/workspace/gmail/markup/reference/types/ProgramMembership) | Any membership in a frequent flyer, hotel loyalty program, etc. being applied to the reservation. |
| programMembership.**memberNumber** | [Text](/workspace/gmail/markup/reference/types/Text) | The identifier of the membership. |
| programMembership.**program** | [Text](/workspace/gmail/markup/reference/types/Text) | The name of the program. |
| **reservationFor**  **(Required)** | [LodgingBusiness](/workspace/gmail/markup/reference/types/LodgingBusiness) | The lodging the reservation is at. |
| reservationFor.**address**  **(Required)** | [PostalAddress](/workspace/gmail/markup/reference/types/PostalAddress) | Address of the Address of lodging. |
| reservationFor.address.**addressCountry**  **(Required)** | [Text](/workspace/gmail/markup/reference/types/Text) or [Country](/workspace/gmail/markup/reference/types/Country) | Country of Address of lodging. |
| reservationFor.address.**addressLocality**  **(Required)** | [Text](/workspace/gmail/markup/reference/types/Text) | Locality (e.g. city) of Address of lodging. |
| reservationFor.address.**addressRegion**  **(Required)** | [Text](/workspace/gmail/markup/reference/types/Text) | Region (e.g. State) of Address of lodging. |
| reservationFor.address.**postalCode**  **(Required)** | [Text](/workspace/gmail/markup/reference/types/Text) | Postal code of Address of lodging. |
| reservationFor.address.**streetAddress**  **(Required)** | [Text](/workspace/gmail/markup/reference/types/Text) | Street address of Address of lodging. |
| reservationFor.**image** | [URL](/workspace/gmail/markup/reference/types/URL) | Photo of the lodging business. |
| reservationFor.**name**  **(Required)** | [Text](/workspace/gmail/markup/reference/types/Text) | Name of the Address of lodging. |
| reservationFor.**telephone**  **(Required)** | [Text](/workspace/gmail/markup/reference/types/Text) | Telephone number of the LodgingBusiness. |
| reservationFor.**url** | [URL](/workspace/gmail/markup/reference/types/URL) | Website of the lodging business. |
| **reservationNumber**  **(Required)** | [Text](/workspace/gmail/markup/reference/types/Text) | The number or id of the reservation. |
| **reservationStatus**  **(Required)** | [ReservationStatus](/workspace/gmail/markup/reference/types/ReservationStatus) | Current status of the reservation. |
| **underName**  **(Required)** | [Person](/workspace/gmail/markup/reference/types/Person) or [Organization](/workspace/gmail/markup/reference/types/Organization) | The guest. |
| underName.**email** | [Text](/workspace/gmail/markup/reference/types/Text) | Email address. |
| underName.**name**  **(Required)** | [Text](/workspace/gmail/markup/reference/types/Text) | Name of the Person. |
| **url** | [URL](/workspace/gmail/markup/reference/types/URL) | Web page where reservation can be viewed. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/Offer

Send feedback

# Offer Stay organized with collections Save and categorize content based on your preferences.

Type name: [Offer](/workspace/gmail/markup/reference/types/Offer)

Extends [Intangible](/workspace/gmail/markup/reference/types/Intangible)

| Name | Type | Description |
| --- | --- | --- |
| acceptedPaymentMethod | [PaymentMethod](/workspace/gmail/markup/reference/types/PaymentMethod) | The payment method(s) accepted by seller for this offer. |
| addOn | [Offer](/workspace/gmail/markup/reference/types/Offer) | An additional offer that can only be obtained in combination with the first base offer (e.g. supplements and extensions that are available for a surcharge). |
| advanceBookingRequirement | [QuantitativeValue](/workspace/gmail/markup/reference/types/QuantitativeValue) | The amount of time that is required between accepting the offer and the actual usage of the resource or service. |
| aggregateRating | [AggregateRating](/workspace/gmail/markup/reference/types/AggregateRating) | The overall rating, based on a collection of reviews or ratings, of the item. |
| availability | [ItemAvailability](/workspace/gmail/markup/reference/types/ItemAvailability) | The availability of this item—for example In stock, Out of stock, Pre-order, etc. |
| availabilityEnds | [DateTime](/workspace/gmail/markup/reference/types/DateTime) | The end of the availability of the product or service included in the offer. |
| availabilityStarts | [DateTime](/workspace/gmail/markup/reference/types/DateTime) | The beginning of the availability of the product or service included in the offer. |
| availableAtOrFrom | [Place](/workspace/gmail/markup/reference/types/Place) | The place(s) from which the offer can be obtained (e.g. store locations). |
| availableDeliveryMethod | [DeliveryMethod](/workspace/gmail/markup/reference/types/DeliveryMethod) | The delivery method(s) available for this offer. |
| businessFunction | [BusinessFunction](/workspace/gmail/markup/reference/types/BusinessFunction) | The business function (e.g. sell, lease, repair, dispose) of the offer or component of a bundle (TypeAndQuantityNode). The default is http://purl.org/goodrelations/v1#Sell. |
| category | [PhysicalActivityCategory](/workspace/gmail/markup/reference/types/PhysicalActivityCategory), [Text](/workspace/gmail/markup/reference/types/Text) or [Thing](/workspace/gmail/markup/reference/types/Thing) | A category for the item. Greater signs or slashes can be used to informally indicate a category hierarchy. |
| deliveryLeadTime | [QuantitativeValue](/workspace/gmail/markup/reference/types/QuantitativeValue) | The typical delay between the receipt of the order and the goods leaving the warehouse. |
| eligibleCustomerType | [BusinessEntityType](/workspace/gmail/markup/reference/types/BusinessEntityType) | The type(s) of customers for which the given offer is valid. |
| eligibleDuration | [QuantitativeValue](/workspace/gmail/markup/reference/types/QuantitativeValue) | The duration for which the given offer is valid. |
| eligibleQuantity | [QuantitativeValue](/workspace/gmail/markup/reference/types/QuantitativeValue) | The interval and unit of measurement of ordering quantities for which the offer or price specification is valid. This allows e.g. specifying that a certain freight charge is valid only for a certain quantity. |
| eligibleRegion | [GeoShape](/workspace/gmail/markup/reference/types/GeoShape) or [Text](/workspace/gmail/markup/reference/types/Text) | The ISO 3166-1 (ISO 3166-1 alpha-2) or ISO 3166-2 code, or the GeoShape for the geo-political region(s) for which the offer or delivery charge specification is valid. |
| eligibleTransactionVolume | [PriceSpecification](/workspace/gmail/markup/reference/types/PriceSpecification) | The transaction volume, in a monetary unit, for which the offer or price specification is valid, e.g. for indicating a minimal purchasing volume, to express free shipping above a certain order volume, or to limit the acceptance of credit cards to purchases to a certain minimal amount. |
| gtin13 | [Text](/workspace/gmail/markup/reference/types/Text) | The [GTIN-13](http://apps.gs1.org/GDD/glossary/Pages/GTIN-13.aspx) code of the product, or the product to which the offer refers. This is equivalent to 13-digit ISBN codes and EAN UCC-13. Former 12-digit UPC codes can be converted into a GTIN-13 code by simply adding a preceeding zero. See [GS1 GTIN Summary](http://www.gs1.org/barcodes/technical/idkeys/gtin) for more details. |
| gtin14 | [Text](/workspace/gmail/markup/reference/types/Text) | The [GTIN-14](http://apps.gs1.org/GDD/glossary/Pages/GTIN-14.aspx) code of the product, or the product to which the offer refers. See [GS1 GTIN Summary](http://www.gs1.org/barcodes/technical/idkeys/gtin) for more details. |
| gtin8 | [Text](/workspace/gmail/markup/reference/types/Text) | The [GTIN-8](http://apps.gs1.org/GDD/glossary/Pages/GTIN-8.aspx) code of the product, or the product to which the offer refers. This code is also known as EAN/UCC-8 or 8-digit EAN. See [GS1 GTIN Summary](http://www.gs1.org/barcodes/technical/idkeys/gtin) for more details. |
| includesObject | [TypeAndQuantityNode](/workspace/gmail/markup/reference/types/TypeAndQuantityNode) | This links to a node or nodes indicating the exact quantity of the products included in the offer. |
| ineligibleRegion | [Place](/workspace/gmail/markup/reference/types/Place) | The place(s) from which the offer cannot be obtained (e.g. a region where the transaction is not allowed). |
| inventoryLevel | [QuantitativeValue](/workspace/gmail/markup/reference/types/QuantitativeValue) | The current approximate inventory level for the item or items. |
| itemCondition | [OfferItemCondition](/workspace/gmail/markup/reference/types/OfferItemCondition) | A predefined value from OfferItemCondition or a textual description of the condition of the product or service, or the products or services included in the offer. |
| itemOffered | [Product](/workspace/gmail/markup/reference/types/Product) | The item being offered. |
| mpn | [Text](/workspace/gmail/markup/reference/types/Text) | The Manufacturer Part Number (MPN) of the product, or the product to which the offer refers. |
| price | [Number](/workspace/gmail/markup/reference/types/Number) or [Text](/workspace/gmail/markup/reference/types/Text) | Total price of the Reservation. |
| priceCurrency | [Text](/workspace/gmail/markup/reference/types/Text) | The currency (in 3-letter ISO 4217 format) of the Reservation's price. |
| priceSpecification | [PriceSpecification](/workspace/gmail/markup/reference/types/PriceSpecification) | One or more detailed price specifications, indicating the unit price and delivery or payment charges. |
| priceValidUntil | [Date](/workspace/gmail/markup/reference/types/Date) | The date after which the price is no longer available. |
| review | [Review](/workspace/gmail/markup/reference/types/Review) | The review. |
| reviews | [Review](/workspace/gmail/markup/reference/types/Review) | Review of the item. |
| seller | [Organization](/workspace/gmail/markup/reference/types/Organization) or [Person](/workspace/gmail/markup/reference/types/Person) | An entity which offers (sells / leases / lends / loans) the services / goods. A seller may also be a provider. |
| serialNumber | [Text](/workspace/gmail/markup/reference/types/Text) | The serial number or any alphanumeric identifier of a particular product. When attached to an offer, it is a shortcut for the serial number of the product included in the offer. |
| sku | [Text](/workspace/gmail/markup/reference/types/Text) | The Stock Keeping Unit (SKU), i.e. a merchant-specific identifier for a product or service, or the product to which the offer refers. |
| validFrom | [DateTime](/workspace/gmail/markup/reference/types/DateTime) | The date when the item becomes valid. |
| validThrough | [DateTime](/workspace/gmail/markup/reference/types/DateTime) | The end of the validity of offer, price specification, or opening hours data. |
| warranty | [WarrantyPromise](/workspace/gmail/markup/reference/types/WarrantyPromise) | The warranty promise(s) included in the offer. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/android/com/google/android/gm/contentprovider/package-summary

Send feedback

# com.google.android.gm.contentprovider Stay organized with collections Save and categorize content based on your preferences.

### Classes

|  |  |
| --- | --- |
| [GmailContract](https://developers.google.com/workspace/gmail/android/com/google/android/gm/contentprovider/GmailContract.html) | Contract for use with the Gmail content provider. |
| [GmailContract.Labels](https://developers.google.com/workspace/gmail/android/com/google/android/gm/contentprovider/GmailContract.Labels.html) | Table containing label information. |
| [GmailContract.Labels.LabelCanonicalNames](https://developers.google.com/workspace/gmail/android/com/google/android/gm/contentprovider/GmailContract.Labels.LabelCanonicalNames.html) | Label canonical names for default Gmail system labels. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/api/reference/quota

Send feedback

# Usage limits Stay organized with collections Save and categorize content based on your preferences.

The Gmail API is subject to usage limits which restrict the rate at which
methods of the API can be called. Limits are defined in terms of [quota
units](#per-method_quota_usage), an abstract unit of measurement representing
Gmail resource usage. There are two usage limits which are applied
simultaneously: a per project usage limit and a per user usage limit. The
following table details these usage limits:

| Usage limit type | Limit | Exceeded reason |
| --- | --- | --- |
| Per project rate limit | 1,200,000 quota units per minute | [rateLimitExceeded](https://developers.google.com/workspace/gmail/api/guides/handle-errors#resolve_a_403_error_rate_limit_exceeded) |
| Per user rate limit | 15,000 quota units per user per minute | [userRateLimitExceeded](https://developers.google.com/workspace/gmail/api/guides/handle-errors#resolve_a_403_error_user_rate_limit_exceeded) |

**Note:** For information on handling limit errors, refer to [Resolve
errors](/workspace/gmail/api/guides/handle-errors).

## Per-method quota usage

The number of quota units consumed by a request varies depending on the method
called. The following table outlines the per-method quota unit usage:

| Method | Quota Units |
| --- | --- |
| `drafts.create` | 10 |
| `drafts.delete` | 10 |
| `drafts.get` | 5 |
| `drafts.list` | 5 |
| `drafts.send` | 100 |
| `drafts.update` | 15 |
| `getProfile` | 1 |
| `history.list` | 2 |
| `labels.create` | 5 |
| `labels.delete` | 5 |
| `labels.get` | 1 |
| `labels.list` | 1 |
| `labels.update` | 5 |
| `messages.attachments.get` | 5 |
| `messages.batchDelete` | 50 |
| `messages.batchModify` | 50 |
| `messages.delete` | 10 |
| `messages.get` | 5 |
| `messages.import` | 25 |
| `messages.insert` | 25 |
| `messages.list` | 5 |
| `messages.modify` | 5 |
| `messages.send` | 100 |
| `messages.trash` | 5 |
| `messages.untrash` | 5 |
| `settings.delegates.create` | 100 |
| `settings.delegates.delete` | 5 |
| `settings.delegates.get` | 1 |
| `settings.delegates.list` | 1 |
| `settings.filters.create` | 5 |
| `settings.filters.delete` | 5 |
| `settings.filters.get` | 1 |
| `settings.filters.list` | 1 |
| `settings.forwardingAddresses.create` | 100 |
| `settings.forwardingAddresses.delete` | 5 |
| `settings.forwardingAddresses.get` | 1 |
| `settings.forwardingAddresses.list` | 1 |
| `settings.getAutoForwarding` | 1 |
| `settings.getImap` | 1 |
| `settings.getPop` | 1 |
| `settings.getVacation` | 1 |
| `settings.sendAs.create` | 100 |
| `settings.sendAs.delete` | 5 |
| `settings.sendAs.get` | 1 |
| `settings.sendAs.list` | 1 |
| `settings.sendAs.update` | 100 |
| `settings.sendAs.verify` | 100 |
| `settings.updateAutoForwarding` | 5 |
| `settings.updateImap` | 5 |
| `settings.updatePop` | 100 |
| `settings.updateVacation` | 5 |
| `stop` | 50 |
| `threads.delete` | 20 |
| `threads.get` | 10 |
| `threads.list` | 10 |
| `threads.modify` | 10 |
| `threads.trash` | 10 |
| `threads.untrash` | 10 |
| `watch` | 100 |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/BusinessEvent

Send feedback

# BusinessEvent Stay organized with collections Save and categorize content based on your preferences.

Type name: [BusinessEvent](/workspace/gmail/markup/reference/types/BusinessEvent)

Extends [Event](/workspace/gmail/markup/reference/types/Event)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/BloodTest

Send feedback

# BloodTest Stay organized with collections Save and categorize content based on your preferences.

Type name: [BloodTest](/workspace/gmail/markup/reference/types/BloodTest)

Extends [MedicalTest](/workspace/gmail/markup/reference/types/MedicalTest)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/Game

Send feedback

# Game Stay organized with collections Save and categorize content based on your preferences.

Type name: [Game](/workspace/gmail/markup/reference/types/Game)

Extends [CreativeWork](/workspace/gmail/markup/reference/types/CreativeWork)

| Name | Type | Description |
| --- | --- | --- |
| characterAttribute | [Thing](/workspace/gmail/markup/reference/types/Thing) | A piece of data that represents a particular aspect of a fictional character (skill, power, character points, advantage, disadvantage). |
| gameItem | [Thing](/workspace/gmail/markup/reference/types/Thing) | An item is an object within the game world that can be collected by a player or, occasionally, a non-player character. |
| gameLocation | [Place](/workspace/gmail/markup/reference/types/Place), [PostalAddress](/workspace/gmail/markup/reference/types/PostalAddress) or [URL](/workspace/gmail/markup/reference/types/URL) | Real or fictional location of the game (or part of game). |
| numberOfPlayers | [QuantitativeValue](/workspace/gmail/markup/reference/types/QuantitativeValue) | Indicate how many people can play this game (minimum, maximum, or range). |
| quest | [Thing](/workspace/gmail/markup/reference/types/Thing) | The task that a player-controlled character, or group of characters may complete in order to gain a reward. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/AppendAction

Send feedback

# AppendAction Stay organized with collections Save and categorize content based on your preferences.

Type name: [AppendAction](/workspace/gmail/markup/reference/types/AppendAction)

Extends [InsertAction](/workspace/gmail/markup/reference/types/InsertAction)

**Note:** This type has no properties




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/RentalCarReservation

Send feedback

# RentalCarReservation Stay organized with collections Save and categorize content based on your preferences.

Type name: [RentalCarReservation](/workspace/gmail/markup/reference/types/RentalCarReservation)

Extends [Reservation](/workspace/gmail/markup/reference/types/Reservation)

| Name | Type | Description |
| --- | --- | --- |
| **bookingAgent** | [Organization](/workspace/gmail/markup/reference/types/Organization) or [Person](/workspace/gmail/markup/reference/types/Person) | Booking agent or agency. Also accepts a string (e.g. ""). |
| bookingAgent.**name** | [Text](/workspace/gmail/markup/reference/types/Text) | Name of the agent/service. |
| bookingAgent.**url** | [URL](/workspace/gmail/markup/reference/types/URL) | Website of the agent/service. |
| **bookingTime** | [DateTime](/workspace/gmail/markup/reference/types/DateTime) | Date the reservation was made. |
| **cancelReservationUrl** | [URL](/workspace/gmail/markup/reference/types/URL) | Web page where reservation can be cancelled. |
| **checkinUrl** | [URL](/workspace/gmail/markup/reference/types/URL) | Webpage where the passenger can check in. |
| **confirmReservationUrl** | [URL](/workspace/gmail/markup/reference/types/URL) | Web page where reservation can be confirmed. |
| **dropoffLocation**  **(Required)** | [AutoRental](/workspace/gmail/markup/reference/types/AutoRental) or [Place](/workspace/gmail/markup/reference/types/Place) | Where the car is returned. |
| dropoffLocation.**address**  **(Required)** | [PostalAddress](/workspace/gmail/markup/reference/types/PostalAddress) | Address of the dropoff location. |
| dropoffLocation.address.**addressCountry**  **(Required)** | [Text](/workspace/gmail/markup/reference/types/Text) or [Country](/workspace/gmail/markup/reference/types/Country) | Country of dropoff location. |
| dropoffLocation.address.**addressLocality**  **(Required)** | [Text](/workspace/gmail/markup/reference/types/Text) | Locality (e.g. city) of dropoff location. |
| dropoffLocation.address.**addressRegion**  **(Required)** | [Text](/workspace/gmail/markup/reference/types/Text) | Region (e.g. State) of dropoff location. |
| dropoffLocation.address.**postalCode**  **(Required)** | [Text](/workspace/gmail/markup/reference/types/Text) | Postal code of dropoff location. |
| dropoffLocation.address.**streetAddress**  **(Required)** | [Text](/workspace/gmail/markup/reference/types/Text) | Street address of dropoff location. |
| dropoffLocation.**name**  **(Required)** | [Text](/workspace/gmail/markup/reference/types/Text) | Name of the dropoff location. |
| dropoffLocation.**telephone** | [Text](/workspace/gmail/markup/reference/types/Text) | (recommended for Confirmation Cards/Search Answers) Telephone number of the Place. |
| **dropoffTime**  **(Required)** | [DateTime](/workspace/gmail/markup/reference/types/DateTime) | When the car is returned. |
| **modifiedTime** | [DateTime](/workspace/gmail/markup/reference/types/DateTime) | (recommended for Confirmation Cards/Search Answers) Time the reservation was last modified. |
| **modifyReservationUrl** | [URL](/workspace/gmail/markup/reference/types/URL) | (recommended for Confirmation Cards/Search Answers) Web page where reservation can be modified. |
| **pickupLocation**  **(Required)** | [AutoRental](/workspace/gmail/markup/reference/types/AutoRental) or [Place](/workspace/gmail/markup/reference/types/Place) | Where the car is picked up. |
| pickupLocation.**address**  **(Required)** | [PostalAddress](/workspace/gmail/markup/reference/types/PostalAddress) | Address of the pickup location. |
| pickupLocation.address.**addressCountry**  **(Required)** | [Text](/workspace/gmail/markup/reference/types/Text) or [Country](/workspace/gmail/markup/reference/types/Country) | Country of pickup location. |
| pickupLocation.address.**addressLocality**  **(Required)** | [Text](/workspace/gmail/markup/reference/types/Text) | Locality (e.g. city) of pickup location. |
| pickupLocation.address.**addressRegion**  **(Required)** | [Text](/workspace/gmail/markup/reference/types/Text) | Region (e.g. State) of pickup location. |
| pickupLocation.address.**postalCode**  **(Required)** | [Text](/workspace/gmail/markup/reference/types/Text) | Postal code of pickup location. |
| pickupLocation.address.**streetAddress**  **(Required)** | [Text](/workspace/gmail/markup/reference/types/Text) | Street address of pickup location. |
| pickupLocation.**name**  **(Required)** | [Text](/workspace/gmail/markup/reference/types/Text) | Name of the pickup location. |
| pickupLocation.**telephone** | [Text](/workspace/gmail/markup/reference/types/Text) | (recommended for Confirmation Cards/Search Answers) Telephone number of the Place. |
| **pickupTime**  **(Required)** | [DateTime](/workspace/gmail/markup/reference/types/DateTime) | When the car is picked up. |
| **potentialAction**  **(Required)** | [CheckInAction](/workspace/gmail/markup/reference/types/CheckInAction), [ConfirmAction](/workspace/gmail/markup/reference/types/ConfirmAction), [CancelAction](/workspace/gmail/markup/reference/types/CancelAction) or | Actions supported for RentalCarReservation. |
| **price** | [Text](/workspace/gmail/markup/reference/types/Text) | Total price of the RentalCarReservation. |
| **priceCurrency** | [Text](/workspace/gmail/markup/reference/types/Text) | The currency (in 3-letter ISO 4217 format) of the RentalCarReservation's price. |
| **programMembership** | [ProgramMembership](/workspace/gmail/markup/reference/types/ProgramMembership) | Any membership in a frequent flyer, hotel loyalty program, etc. being applied to the reservation. |
| programMembership.**memberNumber** | [Text](/workspace/gmail/markup/reference/types/Text) | The identifier of the membership. |
| programMembership.**program** | [Text](/workspace/gmail/markup/reference/types/Text) | The name of the program. |
| **reservationFor**  **(Required)** |  | The car that is reserved. |
| reservationFor.**brand**  **(Required)** | [Brand](/workspace/gmail/markup/reference/types/Brand) | The brand associated with the RentalCar. |
| reservationFor.brand.**name**  **(Required)** | [Text](/workspace/gmail/markup/reference/types/Text) | Name of the Brand. |
| reservationFor.**description** | [Text](/workspace/gmail/markup/reference/types/Text) | A short description of the RentalCar. |
| reservationFor.**model**  **(Required)** | [Text](/workspace/gmail/markup/reference/types/Text) | RentalCar's model. |
| reservationFor.**name**  **(Required)** | [Text](/workspace/gmail/markup/reference/types/Text) | Name of the RentalCar. |
| reservationFor.**rentalCompany**  **(Required)** | [Organization](/workspace/gmail/markup/reference/types/Organization) | The company renting the car. Also accepts a string (e.g. "Hertz"). |
| reservationFor.rentalCompany.**name**  **(Required)** | [Text](/workspace/gmail/markup/reference/types/Text) | Name of the rental company. |
| **reservationNumber**  **(Required)** | [Text](/workspace/gmail/markup/reference/types/Text) | The number or id of the reservation. |
| **reservationStatus**  **(Required)** | [ReservationStatus](/workspace/gmail/markup/reference/types/ReservationStatus) | Current status of the reservation. |
| **underName**  **(Required)** | [Organization](/workspace/gmail/markup/reference/types/Organization) or [Person](/workspace/gmail/markup/reference/types/Person) | The driver. |
| underName.**email** | [Text](/workspace/gmail/markup/reference/types/Text) | Email address. |
| underName.**name**  **(Required)** | [Text](/workspace/gmail/markup/reference/types/Text) | Name of the Person. |
| **url** | [URL](/workspace/gmail/markup/reference/types/URL) | Web page where reservation can be viewed. |




Was this helpful?



Send feedback

---
# https://developers.google.com/workspace/gmail/markup/reference/types/MedicalWebPage

Send feedback

# MedicalWebPage Stay organized with collections Save and categorize content based on your preferences.

Type name: [MedicalWebPage](/workspace/gmail/markup/reference/types/MedicalWebPage)

Extends [WebPage](/workspace/gmail/markup/reference/types/WebPage)

| Name | Type | Description |
| --- | --- | --- |
| aspect | [Text](/workspace/gmail/markup/reference/types/Text) | An aspect of medical practice that is considered on the page, such as 'diagnosis', 'treatment', 'causes', 'prognosis', 'etiology', 'epidemiology', etc. |




Was this helpful?



Send feedback