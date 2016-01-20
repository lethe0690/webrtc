/**
 * Created by lethe on 1/15/16.
 */

'use strict';

var extensionInstalled = false;

document.getElementById('start').addEventListener('click', function() {
    // send screen-sharer request to content-script
    if (!extensionInstalled){
        var message = 'Please install the extension:\n' +
            '1. Go to chrome://extensions\n' +
            '2. Check: "Enable Developer mode"\n' +
            '3. Click: "Load the unpacked extension..."\n' +
            '4. Choose "extension" folder from the repository\n' +
            '5. Reload this page';
        alert(message);
    }
    window.postMessage({ type: 'SS_UI_REQUEST', text: 'start' }, '*');
});

// listen for messages from the content-script
window.addEventListener('message', function (event) {
    if (event.origin != window.location.origin) return;

    // content-script will send a 'SS_PING' msg if extension is installed
    if (event.data.type && (event.data.type === 'SS_PING')) {
        extensionInstalled = true;
    }

    // user chose a stream
    if (event.data.type && (event.data.type === 'SS_DIALOG_SUCCESS')) {
        //startScreenStreamFrom(event.data.streamId);
        //displayLocalStream(event.data.streamId);
        initSharing(event.data.streamId);
    }

    // user clicked on 'cancel' in choose media dialog
    if (event.data.type && (event.data.type === 'SS_DIALOG_CANCEL')) {
        console.log('User cancelled!');
    }
});

var isChannelReady;
var isInitiator = false;
var isStarted = false;
var localStream;
var remoteStream;

var pc;
var turnReady;

var pc_config = {'iceServers': [{'url': 'stun:stun.l.google.com:19302'}]};

var sdpConstraints = {'mandatory': {
    'OfferToReceiveAudio':true,
    'OfferToReceiveVideo':true }};

var room= "TestRoom";

var socket = io.connect('https://localhost:2013');

if (room !== '') {
    console.log('Create or join room', room);
    socket.emit('create or join', room);
}

var localVideo = document.querySelector('#localVideo');
var remoteVideo = document.querySelector('#remoteVideo');

function initSharing(inputstreamId)
{
    var constraints = {
        audio: false,
        video: {
            mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: inputstreamId,
                maxWidth: window.screen.width,
                maxHeight: window.screen.height
            }
        }
    };
    getUserMedia(constraints, handleUserMedia, handleUserMediaError);
}

//if (location.hostname != "localhost") {
//    requestTurn('https://computeengineondemand.appspot.com/turn?username=41784574&key=4080218913');
//}

function requestTurn(turn_url) {
    var turnExists = false;
    for (var i in pc_config.iceServers) {
        if (pc_config.iceServers[i].url.substr(0, 5) === 'turn:') {
            turnExists = true;
            turnReady = true;
            break;
        }
    }
    if (!turnExists) {
        console.log('Getting TURN server from ', turn_url);
        // No TURN server. Get one from computeengineondemand.appspot.com:
        var xhr = new XMLHttpRequest();
        xhr.onreadystatechange = function(){
            if (xhr.readyState === 4 && xhr.status === 200) {
                var turnServer = JSON.parse(xhr.responseText);
                console.log('Got TURN server: ', turnServer);
                pc_config.iceServers.push({
                    'url': 'turn:' + turnServer.username + '@' + turnServer.turn,
                    'credential': turnServer.password
                });
                turnReady = true;
            }
        };
        xhr.open('GET', turn_url, true);
        xhr.send();
    }
}

function handleUserMedia(stream) {
    console.log('STEP -- Adding local stream.');
    localVideo.src = window.URL.createObjectURL(stream);
    localStream = stream;
    sendMessage('got user media',room);
    if (isInitiator) {
        maybeStart();
    }
}

function sendMessage(message,roomId){
    console.log('Client sending message: ', message);
    // if (typeof message === 'object') {
    //   message = JSON.stringify(message);
    // }
    socket.emit('message', message,roomId);
}

socket.on('message', function (message){
    console.log('Client received message:', message);
    if (message === 'got user media') {
        maybeStart();
    } else if (message.type === 'offer') {
        if (!isInitiator && !isStarted) {
            maybeStart();
        }
        pc.setRemoteDescription(new RTCSessionDescription(message));
        doAnswer();
    }
    else if (message.type === 'answer' && isStarted) {
        pc.setRemoteDescription(new RTCSessionDescription(message));
    }
    else if (message.type === 'candidate' && isStarted) {
        var candidate = new RTCIceCandidate({
            sdpMLineIndex: message.label,
            candidate: message.candidate
        });
        pc.addIceCandidate(candidate);
    }
    else if (message === 'bye' && isStarted) {
        handleRemoteHangup();
    }
});

function maybeStart() {
    if (!isStarted && typeof localStream != 'undefined' && isChannelReady) {
        createPeerConnection();
        pc.addStream(localStream);
        isStarted = true;
        console.log('isInitiator', isInitiator);
        if (isInitiator) {
            doCall();
        }
    }
}

function createPeerConnection() {
    try {
        pc = new RTCPeerConnection(null);
        pc.onicecandidate = handleIceCandidate;
        pc.onaddstream = handleRemoteStreamAdded;
        pc.onremovestream = handleRemoteStreamRemoved;
        console.log('Created RTCPeerConnnection');
    } catch (e) {
        console.log('Failed to create PeerConnection, exception: ' + e.message);
        alert('Cannot create RTCPeerConnection object.');
        return;
    }
}

function handleIceCandidate(event) {
    console.log('handleIceCandidate event: ', event);
    if (event.candidate) {
    //if(event.candidate && isStarted){
    //
    //    var icecandidate = new RTCIceCandidate({
    //        sdpMLineIndex: event.candidate.sdpMLineIndex,
    //        candidate: event.candidate.candidate
    //    });
    //    pc.addIceCandidate(icecandidate);

        sendMessage({
            type: 'candidate',
            label: event.candidate.sdpMLineIndex,
            id: event.candidate.sdpMid,
            candidate: event.candidate.candidate},room);
    } else {
        console.log('End of candidates.');
    }
}

function handleRemoteStreamAdded(event) {
    console.log('Remote stream added.');
    remoteVideo.src = window.URL.createObjectURL(event.stream);
    remoteStream = event.stream;
}

function handleRemoteStreamRemoved(event) {
    console.log('Remote stream removed. Event: ', event);
}

function handleUserMediaError(error){
    console.log('getUserMedia error: ', error);
}

function doCall() {
    console.log('Sending offer to peer');
    pc.createOffer(setLocalAndSendMessage, handleCreateOfferError);
}

function setLocalAndSendMessage(sessionDescription) {
    // Set Opus as the preferred codec in SDP if Opus is present.
    //sessionDescription.sdp = preferOpus(sessionDescription.sdp);
    pc.setLocalDescription(sessionDescription);
    console.log('setLocalAndSendMessage sending message' , sessionDescription);
    sendMessage(sessionDescription,room);
}

function handleCreateOfferError(event){
    console.log('createOffer() error: ', e);
}

function doAnswer() {
    console.log('Sending answer to peer.');
    pc.createAnswer(setLocalAndSendMessage, null, sdpConstraints);
}

function handleRemoteHangup() {
//  console.log('Session terminated.');
    // stop();
    // isInitiator = false;
}


/////////////////////////////////////////////
//
//// Set Opus as the default audio codec if it's present.
//function preferOpus(sdp) {
//    var sdpLines = sdp.split('\r\n');
//    var mLineIndex = null;
//    // Search for m line.
//    for (var i = 0; i < sdpLines.length; i++) {
//        if (sdpLines[i].search('m=audio') !== -1) {
//            mLineIndex = i;
//            break;
//        }
//    }
//    if (mLineIndex === null) {
//        return sdp;
//    }
//
//    // If Opus is available, set it as the default in m line.
//    for (i = 0; i < sdpLines.length; i++) {
//        if (sdpLines[i].search('opus/48000') !== -1) {
//            var opusPayload = extractSdp(sdpLines[i], /:(\d+) opus\/48000/i);
//            if (opusPayload) {
//                sdpLines[mLineIndex] = setDefaultCodec(sdpLines[mLineIndex], opusPayload);
//            }
//            break;
//        }
//    }
//
//    // Remove CN in m line and sdp.
//    sdpLines = removeCN(sdpLines, mLineIndex);
//
//    sdp = sdpLines.join('\r\n');
//    return sdp;
//}
//
//function extractSdp(sdpLine, pattern) {
//    var result = sdpLine.match(pattern);
//    return result && result.length === 2 ? result[1] : null;
//}
//
//// Set the selected codec to the first in m line.
//function setDefaultCodec(mLine, payload) {
//    var elements = mLine.split(' ');
//    var newLine = [];
//    var index = 0;
//    for (var i = 0; i < elements.length; i++) {
//        if (index === 3) { // Format of media starts from the fourth.
//            newLine[index++] = payload; // Put target payload to the first.
//        }
//        if (elements[i] !== payload) {
//            newLine[index++] = elements[i];
//        }
//    }
//    return newLine.join(' ');
//}
//
//// Strip CN from sdp before CN constraints is ready.
//function removeCN(sdpLines, mLineIndex) {
//    var mLineElements = sdpLines[mLineIndex].split(' ');
//    // Scan from end for the convenience of removing an item.
//    for (var i = sdpLines.length-1; i >= 0; i--) {
//        var payload = extractSdp(sdpLines[i], /a=rtpmap:(\d+) CN\/\d+/i);
//        if (payload) {
//            var cnPos = mLineElements.indexOf(payload);
//            if (cnPos !== -1) {
//                // Remove CN payload from m line.
//                mLineElements.splice(cnPos, 1);
//            }
//            // Remove CN line in sdp
//            sdpLines.splice(i, 1);
//        }
//    }
//
//    sdpLines[mLineIndex] = mLineElements.join(' ');
//    return sdpLines;
//}






socket.on('created', function (room){
    console.log('Created room ' + room);
    isInitiator = true;
});

socket.on('full', function (room){
    console.log('Room ' + room + ' is full');
});

socket.on('join', function (room){
    console.log('Another peer made a request to join room ' + room);
    console.log('This peer is the initiator of room ' + room + '!');
    isChannelReady = true;
});

socket.on('joined', function (room){
    console.log('This peer has joined room ' + room);
    isChannelReady = true;
});

socket.on('log', function (array){
    console.log.apply(console, array);
});