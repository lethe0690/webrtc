/**
 * Created by lethe on 1/21/16.
 */

'use strict';

var extensionInstalled = false;
var room;

var isChannelReady;
var isInitiator = false;
var isStarted = false;
var localStream;
var remoteStream;

var localVideo = document.querySelector('#videoContainer');
var remoteVideo = document.querySelector('#videoContainer');

var sdpConstraints = {'mandatory': {
    'OfferToReceiveAudio':true,
    'OfferToReceiveVideo':true }};

//peer connection
var pc;

//socket.io used for exchanging message
var socket = io.connect('https://localhost:2013');
//var socket = io.connect('https://192.168.1.88:3000');

//-------------socket listening--------------
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
    maybeStart();
});

socket.on('joined', function (room){
    console.log('This peer has joined room ' + room);
    isChannelReady = true;
});

//----------dealing with incomming message

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
    }
    else if (message.type === 'offer') {
        if (!isInitiator && !isStarted)
        {
            maybeStart();
        }
        pc.setRemoteDescription(new RTCSessionDescription(message));
        //console.log("I AM HERE ALREADY");
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


//-----------------extension stream source control---------
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
        console.log("after emit create or join,the init state is",isInitiator);
        initSharing(event.data.streamId);
    }

    // user clicked on 'cancel' in choose media dialog
    if (event.data.type && (event.data.type === 'SS_DIALOG_CANCEL')) {
        console.log('User cancelled!');
    }
});



//-----------------Main Logic-------------------

document.getElementById('startSharing').addEventListener('click', function() {
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

    room = document.getElementById("roomName").value;

    console.log('Create or join room', room);
    socket.emit('create or join', room);

    window.postMessage({ type: 'SS_UI_REQUEST', text: 'start' }, '*');
});

//----------------------
document.getElementById('joinSharing').addEventListener('click', function() {

    room = document.getElementById("roomName").value;

    console.log('Create or join room', room);
    socket.emit('create or join', room);

    createPeerConnection();
});
//---------------------------test

//create peerConnection

//Initializing the call to send out the offer
//if it is the initiator, attach his screen stream , else no stream

function initSharing(inputstreamId){
//if(isInitiator)
//{
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
//}
//else
//{
//
//}
}



//----------------function define--------------
function handleUserMedia(stream) {
    console.log('STEP -- Adding local stream.');
    localVideo.src = window.URL.createObjectURL(stream);

    $('.overlay').show();
    $('.modal').show();

    localStream = stream;
    sendMessage('got user media',room);
    if (isInitiator) {
        maybeStart();
    }
}

function maybeStart() {
    if (!isStarted && typeof localStream != 'undefined' && isChannelReady) {
        createPeerConnection();

        if(isInitiator){
            pc.addStream(localStream);
        }

        isStarted = true;
        console.log('isInitiator', isInitiator);
        if (isInitiator) {
            doCall();
        }
    }
}

function handleUserMediaError(error){
    console.log('getUserMedia error: ', error);
}

function doCall() {
    console.log('Sending offer to peer');
    pc.createOffer(setLocalAndSendMessage, handleCreateOfferError);
}

function doAnswer() {
    console.log('Sending answer to peer.');
    pc.createAnswer(setLocalAndSendMessage, null, sdpConstraints);
}

function setLocalAndSendMessage(sessionDescription) {
    // Set Opus as the preferred codec in SDP if Opus is present.
    //sessionDescription.sdp = preferOpus(sessionDescription.sdp);
    pc.setLocalDescription(sessionDescription);
    console.log('setLocalAndSendMessage sending message' , sessionDescription);
    sendMessage(sessionDescription,room);
}

function handleCreateOfferError(event){
    console.log('createOffer() error: ', event);
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

    $('.overlay').show();
    $('.modal').show();

    remoteStream = event.stream;
}

function handleRemoteStreamRemoved(event) {
    console.log('Remote stream removed. Event: ', event);
}

function handleRemoteHangup() {
  console.log('Session terminated.');
    // stop();
     isInitiator = false;
}