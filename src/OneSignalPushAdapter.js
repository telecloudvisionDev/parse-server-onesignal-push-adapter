"use strict";
// ParsePushAdapter is the default implementation of
// PushAdapter, it uses GCM for android push and APNS
// for ios push.

import { utils } from 'parse-server-push-adapter';
import ParsePushAdapter from 'parse-server-push-adapter';

const Parse = require('parse/node').Parse;
var deepcopy = require('deepcopy');

export class OneSignalPushAdapter {

  constructor(pushConfig = {}) {
    this.https = require('https');

    this.validPushTypes = ['ios', 'android'];
    this.senderMap = {};
    this.OneSignalConfig = {};
    const { oneSignalAppId, oneSignalApiKey } = pushConfig;
    if (!oneSignalAppId || !oneSignalApiKey) {
      throw "Trying to initialize OneSignalPushAdapter without oneSignalAppId or oneSignalApiKey";
    }
    this.OneSignalConfig['appId'] = pushConfig['oneSignalAppId'];
    this.OneSignalConfig['apiKey'] = pushConfig['oneSignalApiKey'];

    this.senderMap['ios'] = this.sendToAPNS.bind(this);
    this.senderMap['android'] = this.sendToGCM.bind(this);
  }

  send(data, installations) {
    let deviceMap = utils.classifyInstallations(installations, this.validPushTypes);

    let sendPromises = [];
    for (let pushType in deviceMap) {
      let sender = this.senderMap[pushType];
      if (!sender) {
        console.log('Can not find sender for push type %s, %j', pushType, data);
        continue;
      }
      let devices = deviceMap[pushType];

      if(devices.length > 0) {
        sendPromises.push(sender(data, devices));
      }
    }
    return Parse.Promise.when(sendPromises);
  }

  static classifyInstallations(installations, validTypes) {
    return utils.classifyInstallations(installations, validTypes)
  }

  getValidPushTypes() {
    return this.validPushTypes;
  }

  sendToAPNS(data,tokens) {

    let tempdata = deepcopy(data['data']);

    let aps = typeof(tempdata.aps) != "undefined" ? deepcopy(tempdata.aps) : {};
    //delete tempdata['aps']; 

    data = {...tempdata, ...aps };

    var post = {};
    if(data['badge']) {
      if(data['badge'] == "Increment") {
        post['ios_badgeType'] = 'Increase';
        post['ios_badgeCount'] = 1;
      } else {
        post['ios_badgeType'] = 'SetTo';
        post['ios_badgeCount'] = data['badge'];
      }
      //delete data['badge'];
      
    }
    
    if(data['sound']) {
      post['ios_sound'] = data['sound'];
      //delete data['sound'];
    }

    if(data['background_data'] == true || data['content-available'] == 1) {
      post['content_available'] = true;
      //delete data['background_data'];
      //delete data['content-available'];
    }

    if(data['thumbnail'])
    {
      post['ios_attachments'] = { "id1" : data['thumbnail']};
    }

    if(data['alert']) {
      post['contents'] = {en: data['alert']};
      //delete data['alert'];
    }
    else
    {
      //post['ios_interruption_level'] = 'passive';
     //post['apns_push_type_override'] = 'background';
      //post['ios_badgeType'] = 'None';
      //post['ios_badgeCount'] = 0;
     //post['ios_sound'] = null;      
      post['content_available'] = true;
      //post['contents'] = null;
      //post['contents'] = {en: 'background'};
      delete post['contents']; 
      delete post['ios_badgeType']; 
      delete post['ios_badgeCount']; 
      delete post['ios_sound']; 
      delete post['ios_attachments']; 

      /*
      content_available : true
alert is omitted
badge is omitted
sound is omitted
category is omitted
thread_id is omitted
subtitle is omitted
contents is omitted
headings is omitted

*/
    }

  
    post['data'] = data;

    let promise = new Parse.Promise();

    var chunk = 2000 // OneSignal can process 2000 devices at a time
    var tokenlength=tokens.length;
    var offset = 0
    // handle onesignal response. Start next batch if there's not an error.
    let handleResponse = function(wasSuccessful) {
      if (!wasSuccessful) {
        return promise.reject("OneSignal Error");
      }

      if(offset >= tokenlength) {
        promise.resolve()
      } else {
        this.sendNext();
      }
    }.bind(this)

    this.sendNext = function() {
      post['include_ios_tokens'] = [];
      tokens.slice(offset,offset+chunk).forEach(function(i) {
        post['include_ios_tokens'].push(i['deviceToken'])
      })
      offset+=chunk;
      this.sendToOneSignal(post, handleResponse);
    }.bind(this)

    this.sendNext()

    return promise;
  }

  sendToGCM(data,tokens) {

    let tempdata = deepcopy(data['data']);

    let aps = typeof(tempdata.aps) != "undefined" ? deepcopy(tempdata.aps) : {};
    //delete tempdata['aps']; 

    data = {...tempdata, ...aps };
    //data= deepcopy(data['data']);

    var post = {};

    if(data['alert']) {
      post['contents'] = {en: data['alert']};
      //delete data['alert'];
    }
    else
    {
      //post['contents'] = {en: 'background'};
    } 

    if(data['title']) {
      post['title'] = {en: data['title']};
      //delete data['title'];
    }
    if(data['uri']) {
      post['url'] = data['uri'];
    }
    if(data['background_data'] == true || data['android_background_data'] == true || data['content-available'] == 1) {
      post['android_background_data'] = true;
      //delete data['background_data'];
      //delete data['android_background_data'];
    }

    if(data['thumbnail'])
    {
      post['big_picture'] = data['thumbnail'];
      post['large_icon'] = data['thumbnail'];
      
    }

    if(data['videoCallRelated'] || data ['tokSessionId'])
    {
      post['android_background_data'] = true;
      delete post['contents'];
    }

    post['data'] = data;

    let promise = new Parse.Promise();

    var chunk = 2000 // OneSignal can process 2000 devices at a time
    var tokenlength=tokens.length;
    var offset = 0
    // handle onesignal response. Start next batch if there's not an error.
    let handleResponse = function(wasSuccessful) {
      if (!wasSuccessful) {
        return promise.reject("OneSIgnal Error");
      }

      if(offset >= tokenlength) {
        promise.resolve()
      } else {
        this.sendNext();
      }
    }.bind(this);

    this.sendNext = function() {
      post['include_android_reg_ids'] = [];
      tokens.slice(offset,offset+chunk).forEach(function(i) {
        post['include_android_reg_ids'].push(i['deviceToken'])
      })
      offset+=chunk;
      this.sendToOneSignal(post, handleResponse);
    }.bind(this)


    this.sendNext();
    return promise;
  }

  sendToOneSignal(data, cb) {
    let headers = {
      "Content-Type": "application/json",
      "Authorization": "Basic "+this.OneSignalConfig['apiKey']
    };
    let options = {
      host: "onesignal.com",
      port: 443,
      path: "/api/v1/notifications",
      method: "POST",
      headers: headers
    };
    data['app_id'] = this.OneSignalConfig['appId'];

    let request = this.https.request(options, function(res) {
      if(res.statusCode < 299) {
        cb(true);
      } else {
        console.log('OneSignal Error');
        res.on('data', function(chunk) {
          console.log(chunk.toString())
        });
        cb(false)
      }
    });
    request.on('error', function(e) {
      console.log("Error connecting to OneSignal")
      console.log(e);
      cb(false);
    });
    request.write(JSON.stringify(data))
    request.end();
  }
}


export default OneSignalPushAdapter;
