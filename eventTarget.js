var EventTarget = function (target, eventTypes) {
    "use strict";

    var eventTypeToHandlers = {}; // Map from event type name string to array of event handlers.

    if (!(this instanceof EventTarget)) {
        throw new Error("EventTarget is a constructor and must be called with new.");
    }

    function validateEventType(eventType) {
        if (!eventTypes.some(function (comparisonEventType) { return eventType === comparisonEventType; })) {
            throw new Error("Event type " + eventType + " not supported. Must be one of " + eventTypes.join(", "));
        }
    }

    function addEventListener(eventType, eventHandler) {
        validateEventType(eventType);
        if (!eventTypeToHandlers.hasOwnProperty(eventType)) {
            eventTypeToHandlers[eventType] = [];
        }
        eventTypeToHandlers[eventType].push(eventHandler);
    }

    function removeEventListener(eventType, eventHandler) {
        validateEventType(eventType);
        if (eventTypeToHandlers.hasOwnProperty(eventType)) {
            eventTypeToHandlers[eventType] = eventTypeToHandlers[eventType].filter(function (comparisonEventHandler) {
                return comparisonEventHandler !== eventHandler;
            });
        }
    }

    function dispatchEvent(eventType, eventArg) {
        var eventHandlers;
        validateEventType(eventType);
        if (eventTypeToHandlers.hasOwnProperty(eventType)) {
            eventHandlers = eventTypeToHandlers[eventType].concat([]);
            setTimeout(function () {
                eventHandlers.forEach(function (eventHandler) {
                    try {
                        eventHandler.call(null, eventArg);
                    }
                    catch (e) {
                        console.error("Error with eventType event handler: " + e + " " + e.stack);
                    }
                });
            }, 0);
        }
        if (target["on" + eventType]) {
            target["on" + eventType].call(null, eventArg);
        }
    }
    this.dispatchEvent = dispatchEvent.bind(this);

    target.addEventListener = addEventListener.bind(this);
    target.removeEventListener = removeEventListener.bind(this);
    eventTypes.forEach(function (eventType) {
        if (!target.hasOwnProperty("on" + eventType)) {
            target["on" + eventType] = null;
        }
    });

    eventTypes.map(function (eventType) {
        return {
            name: "dispatch" + eventType[0].toUpperCase() + eventType.substr(1) + "Event",
            fn: dispatchEvent.bind(this, eventType)
        };
    }.bind(this)).forEach(function (dispatchEntry) {
        this[dispatchEntry.name] = dispatchEntry.fn;
    }.bind(this));
};
