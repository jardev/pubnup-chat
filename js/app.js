var initMap;
var App = function() {
    /* Variables */
    var username;              // User name
    var map;                   // Google Maps instance
    var bounds;                // Bounds for the map
    var pinIconNormal;         // Icon for a regular Google Maps marker
    var pinIconHighlighted;    // Icon for a highlighted Google Maps marker
    var userLocation;          // User's location
    var pubnup;                // PubNup instance
    var users = {};            // Online users list with their locations
    var lastHighlightedMarker; // A utility variable to store last
                               // highlighted marker

    var generateUsername = function() {
        return chance.last().toLowerCase();
    }
    var initUser = function() {
        username = generateUsername();
        $("#username").text(username);
    }
    var autoResizeTextarea = function() {
        jQuery.each(jQuery('textarea[data-autoresize]'), function() {
            var offset = this.offsetHeight - this.clientHeight;

            var resizeTextarea = function(el) {
                jQuery(el).css('height', 'auto').css('height', el.scrollHeight + offset);
            };
            jQuery(this).on('keyup input', function() { resizeTextarea(this); }).removeAttr('data-autoresize');
        });
    };
    initMap = function() {
        map = new google.maps.Map(document.getElementById('map'), {
            center: {lat: -34.397, lng: 150.644},
            zoom: 6
        });
        bounds = new google.maps.LatLngBounds();
        pinIconNormal = new google.maps.MarkerImage(
            "images/spotlight-poi_hdpi_red.png",
            null, /* size is determined at runtime */
            null, /* origin is 0,0 */
            null, /* anchor is bottom center of the scaled image */
            new google.maps.Size(22, 40)
        );
        pinIconHighlighted = new google.maps.MarkerImage(
            "images/spotlight-poi_hdpi_gray.png",
            null, /* size is determined at runtime */
            null, /* origin is 0,0 */
            null, /* anchor is bottom center of the scaled image */
            new google.maps.Size(22, 40)
        );
    };
    var initGEOLocation = function() {
        // Try HTML5 geolocation.
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(function(position) {
                userLocation = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                map.setCenter(userLocation);

                pubnup.setState({
                    state: { location: userLocation },
                    channels: ["chat"]
                })
            }, function() {
                handleLocationError(true, infoWindow, map.getCenter());
            });
        } else {
            // Browser doesn't support Geolocation
            console.log("Could not get location")
        }
    };
    var tabindex = 1;
    var handleMessage = function(data) {
        console.log(data);
        if (data.text) {
            $("#chat").append($(
                "<li tabindex='" + tabindex + "' class='message" +
                (data.username == username ? " me" : "") +
                "'><span class='sender'>" + data.username + ": </span>" +
                data.text +
                "</li>")
            );
            tabindex++;
            $('#chat').scrollTop($('#chat').height());
        }
        updateUserLocation(data.username, data.location);
        highlightLocation(data.username);
    };
    var highlightLocation = function(username) {
        if (lastHighlightedMarker) {
            lastHighlightedMarker.setIcon(pinIconNormal);
        }
        var marker = users[username];
        if (marker) {
            marker.setIcon(pinIconHighlighted);
            marker.setAnimation(google.maps.Animation.BOUNCE);
            lastHighlightedMarker = marker;
            setTimeout(function() {
                marker.setAnimation(null);
            }, 2000);
        }
    };
    var updateUserLocation = function(username, location) {
        if (!location) { return; }

        var marker = users[username];
        if (marker) {
            marker.setMap(null);
        } else {
            bounds.extend(new google.maps.LatLng(location.lat, location.lng));
        }
        marker = new google.maps.Marker({
            position: location,
            title: username,
            scaledSize: new google.maps.Size(11, 20),
        });
        marker.setIcon(pinIconNormal);
        users[username] = marker;
        marker.setMap(map);
        map.fitBounds(bounds);
    };
    var deleteUser = function(username) {
        var marker = users[username];
        if (marker) {
            marker.setMap(null);
        }
        delete users[username];
    };
    var initChannels = function() {
        pubnup = new PubNub({
            subscribeKey: "sub-c-4f6b1042-d8e1-11e6-97d0-0619f8945a4f",
            publishKey: "pub-c-a64fb35d-1c4b-428b-8af2-fad80c15496c",
            uuid: username
        })

        pubnup.addListener({
            message: function(data) { handleMessage(data.message) },
            presence: function(event) {
                if (event.action === "join") {
                    if (! event.uuid in users) {
                        updateUserLocation(event.uuid, event.state.location);
                    }
                } else if (event.action === "state-change") {
                    updateUserLocation(event.uuid, event.state.location);
                } else if (event.action === "leave" || event.action === "timeout") {
                    deleteUser(event.uuid);
                }
            }
        });
        pubnup.subscribe({
            channels: ['chat'],
            withPresence: true,
            state: { location: userLocation }
        });
        pubnup.history({
            channel: 'chat',
            count: 30
        }, function(status, response) {
            for (var i = 0; i < response.messages.length; i++) {
                handleMessage(response.messages[i].entry);
            }
        });
        pubnup.hereNow({
            channels: ["chat"],
            includeUUIDs: true,
            includeState: true
        }, function (status, response) {
            var users = response.channels.chat.occupants;
            for (var i = 0; i < users.length; i++) {
                if (users[i].state) {
                    updateUserLocation(users[i].uuid, users[i].state.location);
                }
            }
        });
    };
    var initHandlers = function() {
        $("#send").click(function(event) {
            var message = $("#message").val();
            if (message != '') {
                pubnup.publish({
                    channel: 'chat',
                    message: {
                        username: username,
                        text: message,
                        location: userLocation
                    }
                });
                $("#message").val("");
            }
        });
        $("#message").bind('keydown', function(event) {
            if ((event.keyCode || event.charCode) !== 13) return true;
            $("#send").click();
            return false;
        });
    };

    return  {
        init: function() {
            autoResizeTextarea();
            initUser();
            initMap();
            initGEOLocation();
            initChannels();
            initHandlers();
        }
    }
}();

$(document).ready(function() {
    App.init();
});