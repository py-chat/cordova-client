
var cordova_app = {
    // Application Constructor
    initialize: function() {
        this.bindEvents();
    },
    // Bind Event Listeners
    //
    // Bind any events that are required on startup. Common events are:
    // 'load', 'deviceready', 'offline', and 'online'.
    bindEvents: function() {
        document.addEventListener('deviceready', this.onDeviceReady, false);
    },
    // deviceready Event Handler
    //
    // The scope of 'this' is the event. In order to call the 'receivedEvent'
    // function, we must explicity call 'app.receivedEvent(...);'
    onDeviceReady: function() {
        app.receivedEvent('deviceready');
    },
    // Update DOM on a Received Event
    receivedEvent: function(id) {
        var parentElement = document.getElementById(id);
        var listeningElement = parentElement.querySelector('.listening');
        var receivedElement = parentElement.querySelector('.received');

        listeningElement.setAttribute('style', 'display:none;');
        receivedElement.setAttribute('style', 'display:block;');

        console.log('Received Event: ' + id);
    }
};
window.openExternal = function(elem) {
    window.open(elem.href, "_system");
    return false;
    // if (elem.href.indexOf('http://') === 0 || elem.href.indexOf('https://') === 0) {
    // }
}
// document.addEventListener('deviceready', function(){
//     $(document).on('mousedown','a', function(e) {
//         e.preventDefault();
//         var elem = $(this);
//         var url = elem.attr('href');
//         if (url.indexOf('http://') !== -1) {
//             window.open(url, '_system');
//         }
//     });
// }, false);



// (function () {
var config = {
    chat_base_url: 'http://py-chat.so',
    // chat_base_url: 'http://py-chat9000.com',
};
var app = {
    views: {},
    models: {},
    routers: {},
    utils: {},
    adapters: {},

    collections: {},
    cached: {},
    socket: null,
    sessionid: null
};

function desu(template, data) {
  return template.replace(/\{([\w\.]*)\}/g, function(str, key) {
    var keys = key.split("."), v = data[keys.shift()];
    for (var i = 0, l = keys.length; i < l; i++) v = v[keys[i]];
    return (typeof v !== "undefined" && v !== null) ? v : "";
  });
}

//////////////////////////////
/// APP
/////////////////////////////

app.routers.AppRouter = Backbone.Router.extend({

    routes: {
        "":                         "rooms",
        "rooms":                    "rooms",
        "room/:slug":               "room", 
        "post/:slug":               "post", 
        "post/:slug/:ref_num":      "post", 
        "post-close":      "post_close", 
    },
    modal_post_template: _.template($('#template-room-post').html()),
    initialize: function () {
        // app.slider = new PageSlider($('body'));
        var self = this;
        app.cached.messages = new app.collections.Messages();
        app.cached.rooms = new app.collections.Rooms();
        app.cached.room_views = {};
        app.cached.roomsView = new app.views.RoomsView({
            collection: app.cached.rooms
        });
        $('body').append($(this.modal_post_template()));

        $.ajax({
            url: config.chat_base_url + '/chat/sessionid',
            crossDomain: true
        }).done(function(sessionid) {
            app.sessionid = sessionid;
            app.socket = app.socket || io.connect(config.chat_base_url, {
                transports: ['websocket'],
                'try multiple transports': false
                ,query: 'sessionid='+app.sessionid
                ,resource: 'socket.io',
                'auto connect': false
            });

            app.socket.on('room_chat_message', function (data) {
                app.cached.messages = app.cached.messages || new app.collections.Messages();
                data.message.room_slug = data.message.room.match(/room\/(\w+)\//i)[1];
                data.message.room = app.cached.rooms.get(data.message.room_slug);
                data.message.id = data.message.room_slug + '-' + data.message.num;
                app.cached.messages.add(data.message);
            });
            app.socket.on('rooms_online_change', function (data) {
                $.each(data, function(room, online){
                    app.cached.rooms.get(room).set('online', online)
                });
            });
            app.socket.on('connect', function(){
                var rooms = app.cached.rooms.map(function(room) { return room.id;});
                console.log('set_rooms', rooms)
                app.socket.emit('set_rooms', {rooms: rooms}, function(data){});
            });

            app.cached.rooms.fetch({
                url: config.chat_base_url + '/api/v1/room/with_latest_messages/'
            }).done(function(){ app.socket.socket.connect(); });
        });
    },
    rooms: function() {
        $('#content > header .title').html('Rooms');
        $('header a.btn[href="#rooms"]').addClass('hiden');
        $('header a.btn.pull-right').addClass('hiden');
        this.switchView(app.cached.roomsView);
    },
    room: function(slug) {
        this.switchView(app.cached.room_views[slug]);
        var room = app.cached.room_views[slug].room;


        $('header a.btn[href="#rooms"]').removeClass('hiden');
        var post = $('header a.btn.pull-right');
        post.attr('href', '#post/'+slug)
        post.removeClass('hiden');
        

        $('#content > header .title').html('Room - ' + room.id + ' (Online: '+room.get('online')+')');
        app.cached.room_views[slug].show();
    },
    switchView: function(view){
        $('#content > .content').addClass('hiden');
        view.$el.removeClass('hiden')
    },
    post: function(slug, ref_num){
        var modal = $('#modal-room-post');
        modal.find('.title').html('Post - '+slug)
        modal.attr('data-room', slug);
        modal.addClass('active');
    },
    post_close: function(){
        $('#modal-room-post').removeClass('active')
    }
});

//////////////////////////////
/// VIEWS
/////////////////////////////

app.views.RoomView = Backbone.View.extend({

    initialize: function(options) {
        var self = this;
        this.room = options.room;
        this.$el = $('<div class="content room-chat hiden" id="room-chat-'+this.room.id+'">');
        $('#content').append(this.$el);
        this.listenTo(this.collection, 'add', this.addOne);
        this.listenTo(this.collection, 'sync', function(){
            self.render();
        });
    },
    render: function () {
        this.$el.html('');
        var self = this;
        this.collection.select(function(message){
            if(message.get('room_slug') == self.room.id){
                self.$el.append(message.render());
            }
        });
    },
    show: function(){
        this.room.set('unread', 0);
    },
    addOne: function(message){
        var self = this;
        var room = message.get('room');
        if(message.get('is_history') == false && room.id == this.room.id){
            self.$el.append(message.render());
            // TODO:
            room.set('unread', room.get('unread') + 1)
        }
    }
});


app.views.RoomsView = Backbone.View.extend({
    // events: {
    //     'submit #modal-room-post form': 'post',
    //     'click #modal-room-post input[type=submit]': 'post'
    // },
    template: _.template($('#template-rooms-list').html()),
    // initialize: function () {
    //     // this.searchResults = new app.models.EmployeeCollection();
    //     // this.searchresultsView = new app.views.EmployeeListView({model: this.searchResults})
    // },
    initialize: function() {
        var self = this;
        var post = function(e){
            e.preventDefault();
            self.post.apply(self, [e]);
            return false;
        }
        $(document).on('submit', '#modal-room-post form', post);
        $(document).on('click','#modal-room-post button', post);

        $('#content').append('<div class="content rooms-list"></div>');
        this.$el = $('#content > .content.rooms-list');

        this.listenTo(this.collection, 'sync', function(){
            self.render();
        });
        this.listenTo(app.cached.messages, 'add', this.addOneMessage);
        // this.collection.bind("change", function(){
        //     console.log('Collection has changed.', arguments);
        // });        
        // this.collection.on("change:online", function(room){
        //     var el = $('#content > .content.rooms-list li[data-room="'+room.id+'"] .badge.online');
        //     el.html('Online: '+room.get('online'))
        // });
        // this.collection.on("change:last_message", function(room){
        //    var message = room.get('last_message')
        //    var li = $('#content > .content.rooms-list li[data-room="'+room.id+'"]');
        //   $('.last_message', li).html(message.get('html'));
        // })
        this.collection.on("change:last_message change:unread", function(room){
            console.log('Collection changed', room.changed);
            self.collection.sort()
            self.render();
        });

        this.listenTo(app.cached.messages, 'add', function(message){
            var room = message.get('room');
            room.set('last_message', message);
            // var li = $('#content > .content.rooms-list li[data-room="'+room.id+'"]');
            // $('.last_message', li).html(message.get('html'));
            // console.log(room, message)
            // room.set('last_message', message)
        });
        // this.collection.on("add", function(room){
        //     console.log(room.get('last_message'))
        // });
        // this.collection.on("change:unread", function(room){
        //     var el = $('#content > .content.rooms-list li[data-room="'+room.id+'"] .badge.unread');
        //     el.html('New: '+room.get('unread'))
        // });
        // app.cached.messages.on("add", function(message){

        //     //     unread = rooom.get('unread', 0);
        //     // app.cached.messages.add(data.message);
        //     // unread.set('unread', unread+1);
        // });
    },

    render: function () {
        var json = this.collection.toJSON();
        this.$el.html(this.template({rooms: json}));
        this.collection.each(function(room){
            app.cached.room_views[room.get('slug')] = app.cached.room_views[room.get('slug')] || new app.views.RoomView({
                collection: app.cached.messages,
                room: room
            });
            app.cached.room_views[room.get('slug')].render();
        });
        this.delegateEvents();
        return this;
    },
    addOneMessage: function(e){
        if(e.get('is_history') == false){
            // console.log(e)
        }
    },
    post: function(e){
        var modal = $(e.target).closest('.modal')
        var room = app.cached.room_views[modal.data('room')].room;
        var msg = modal.find('form textarea').val();

        $.ajax({
          dataType: 'json',
          type: 'POST',
          accepts: {json: 'application/json'},
          contentType: 'application/json',
          crossDomain: true,
          url: config.chat_base_url + '/api/v1/message/',
          data: JSON.stringify({message: msg, room: '/api/v1/room/'+room.id+'/'}),
          xhrFields: {
           withCredentials: true
          },
          // beforeSend: function(xhr) {
          //   xhr.setRequestHeader("Cookie", "sessionid="+app.sessionid);
          // },
          error: function(xhr, status, error){
             alert(error);
             // $(input).val(msg);
             // $(input).focus();
             // var data = JSON.parse(xhr.responseText);
             // var error_text = '';
             // if(data && data.message){
             //     $.each(data.message, function(field, some){
             //        error_text += field + ': ' + data['message'][field];
             //     });
             // }else {
             //     error_text = status + ' - ' + xhr.responseText;
             // }

             // var nano = $('#room-{0} .nano'.format(room));
             // var content = $('#room-{0} .nano > .content'.format(room));
             // var level = data.level || 'warning';
             // content.append('<div class="alert alert-{0}">{1}</div>'.format(level, error_text));
             // scroll_bottom(nano);
          },
          success: function(){
            modal.find('form textarea').val('');
            Backbone.history.navigate('#room/' + room.id, true);
            app.router.post_close();
          }
        });
        return false;
    }

});

app.models.Room = Backbone.Model.extend({

    defaults: function() {
      return {
        title: "empty room...",
        slug: 'null',
        unread: 0,
        last_message: null
      };
    },

    initialize: function() {},
    url: function() {
        return config.chat_base_url + "/api/v1/room/" + this.id + '/';
    },
    // getLastMessage: function(){
    //     return 'Lorem ipsum dolor sit amet, consectetur adipisicing elit, sed do eiusmod tempor incididunt ut labore et dolore. Lorem ipsum dolor sit amet.';
    //     // var message = app.cached.messages.filter(function(message){
    //     //     if(message.get('room_slug') == room.get('slug')){
    //     //         self.$el.append(message.render(room));
    //     //     }
    //     // });
    // },
    parse: function(response) {
        var self = this;
        this.id = response.slug;

        if(response.messages) {
            $.each(response.messages, function(o, obj){
                obj.is_history = true;
                obj.room_slug = obj.room.match(/room\/(\w+)\//i)[1];
                if(obj.room_slug == self.id){
                    obj.room = self;
                }

                obj.id = obj.room_slug + '-' + obj.num;
                var message = app.cached.messages.add(obj);
                if(obj.room_slug == self.id){
                    response.last_message = message
                }
                
            });
        }
        return response;
    }
});

// The collection of our todo models.
app.collections.Rooms = Backbone.Collection.extend({
    model: app.models.Room,
    
    // A catcher for the meta object TastyPie will return.
    meta: {},

    // Set the (relative) url to the API for the item resource.
    url: config.chat_base_url + "/api/v1/room/",

    comparator: function(model){
        var last_message = model.get('last_message');
        if(last_message){
            var timestamp = moment(last_message.get('date')).format('X');
            return -parseInt(timestamp);
        }
        // return model.id;
    },

    // Our API will return an object with meta, then objects list.
    parse: function(response) {
        this.meta = response.meta;
        return response.objects;
    }
});

app.models.Message = Backbone.Model.extend({
    defaults: function() {
      return {
        num: 0,
        html: 'Body of message',
        room: null,
        is_history: false
      };
    },
    template: _.template($("#template-room-chat-message").html()),
    initialize: function() {
        var room = this.get('room');
        room.set('last_message', this);
    },
    url: function() {
        var params = {num: this.get('num'), room__slug: this.get('room')};
        var url = config.chat_base_url + "/api/v1/message/" + this.id + '/?' + $.param(params);
        return url;
    },
    render: function(){
        var msg = this.toJSON();
        msg.date_human = moment(msg.date).format('H:mm:ss');
        // msg.date_human = moment(msg.date).startOf('hour').fromNow();
        var html = this.template({msg: msg, room: this.get('room')});
        var el = $(html);
        el.find('.text a').attr('target', "_system");
        el.find('.text a').attr('onClick', "javascript:return openExternal(this)");
        return el[0].outerHTML;
    },
    parse: function(response) {
        this.id = response.room + '-' + response.num;

        // if(self.get('is_history') == false){
        //     var room = app.cached.rooms.get(message.room_slug),
        //     unread = rooom.get('unread', 0);
        //     room.set('unread', unread+1);
        //     console.log('Change unread', rooom.get('unread'))
        // };

        return response;
    }
    // toggle: function() {
    //   this.save({done: !this.get("done")});
    // }
});

app.collections.Messages = Backbone.Collection.extend({
    model: app.models.Message,
    
    // A catcher for the meta object TastyPie will return.
    meta: {},

    // Set the (relative) url to the API for the item resource.
    url: config.chat_base_url + "/api/v1/message/",

    // Our API will return an object with meta, then objects list.
    parse: function(response) {
        this.meta = response.meta;
        return response.objects;
    }
});

// $(document).on('mousedown','a', function(e) {
//     var elem = $(this);
//     var url = elem.attr('href');
//     if (url.indexOf('http://') === 0 || url.indexOf('https://') === 0) {
//         window.open(url, '_system');
//         e.preventDefault();
//         return false;
//     }
// });
$(document).on("ready", function () {
    // var snapper = new Snap({
    //     element: document.getElementById('content')
    // });

    // $('#toggle-left').on('click', function(){
    //         snapper.open('left');
    // });
    app.router = new app.routers.AppRouter();
    Backbone.history.start();
    // app.utils.templates.load(["RoomsView"], function () {
    //     app.router = new app.routers.AppRouter();
    //     Backbone.history.start();
    // });


});


// }());