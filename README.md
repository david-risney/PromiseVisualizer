# PromiseVisualizer
Visual debugging of JavaScript promises.

Since I created this project I've since seen this which looks nicer: [promisees](https://github.com/bevacqua/promisees/).

## Demo
 - [Simple demo page](http://david-risney.github.io/PromiseVisualizer/demo/simple/)

## Features
 - [ ] Shim native promises and popular promise libraries to collect telemetry. (in progress)
  - [ ] Functions available for shimming unknown promise functions
  - [ ] Auto shim native promises, Q and WinJS
 - [ ] Display per promise info: creation time and stack, resolution time, stack, and value, then connections. (in progress)
 - [ ] Graph the then connections between promises and promise resolution state. (in progress)
 - [ ] Rewind and replay promise events on graph.
 - [ ] Bookmarklet to make it easy to debug on arbitrary website.
