/**
 * Created by lethe on 1/20/16.
 */


var fs = require('fs');
var static = require('node-static');
var https = require('https');

var file = new(static.Server)();

var options = {
    key: fs.readFileSync('domain.key'),
    cert: fs.readFileSync('domain.crt'),
    requestCert: false,
    rejectUnauthorized: false
};

var app = https.createServer(options,function (req, res) {
    file.serve(req, res);
}).listen(2013);

var io = require('socket.io').listen(app);

var roomOwnerList={}

io.sockets.on('connection', function (socket){

    // convenience function to log server messages on the client
    function log(){
        var array = [">>> Message from server: "];
        for (var i = 0; i < arguments.length; i++) {
            array.push(arguments[i]);
        }
        socket.emit('log', array);
    }

    socket.on('message', function (message,toSocketid) {
        log('Got message:', message);
        // for a real app, would be room only (not broadcast)
        //socket.broadcast.emit('message', message);

        socket.to(toSocketid).emit('message', message,toSocketid,socket.id);

        console.log("Socket---"+socket.id+"---send message to:"+toSocketid+" With MsgType: "+message.type);
    });


    socket.on('create or join', function (room) {
        //var numClients = io.sockets.clients(room).length;

        //console.log(io.sockets.adapter.rooms[room]);
        //
        //if(io.sockets.adapter.rooms[room]!=undefined){
        //
        //    numClients = 0;
        //    var test = io.sockets.adapter.rooms[room];
        //    console.log(test.length);
        //}

        var numClients = io.sockets.adapter.rooms[room]!=undefined ? io.sockets.adapter.rooms[room].length:0;
        //var numClients = io.sockets.sockets.length;

        //console.log('Room ' + room + ' has ' + numClients + ' client(s)');
        //console.log(io.sockets.adapter.rooms[room]);


        //log('Room ' + room + ' has ' + numClients + ' client(s)');
        //log('Request to create or join room ' + room);

        if (numClients === 0){
            socket.join(room);
            socket.emit('created', room);

            console.log("I am init-er");

            roomOwnerList[room]=socket.id;

            console.log('Room ' + room + ' has ' + numClients + ' client(s)');
            console.log(io.sockets.adapter.rooms[room]);
            console.log(roomOwnerList);

        } else if (numClients < 5) {
            io.sockets.in(room).emit('join', room,socket.id);
            socket.join(room);
            socket.emit('joined', room,roomOwnerList[room]);

            console.log("New arraival");

            console.log('Room ' + room + ' has ' + numClients + ' client(s)');
            console.log(io.sockets.adapter.rooms[room]);

        } else { // max two clients
            socket.emit('full', room);
            console.log("Full");
        }

        //socket.emit('emit(): client ' + socket.id + ' joined room ' + room);
        //socket.broadcast.emit('broadcast(): client ' + socket.id + ' joined room ' + room);

    });

});

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

