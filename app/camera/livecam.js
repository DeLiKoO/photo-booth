/*
 * This file is part of "photo-booth"
 * Copyright (c) 2018 Philipp Trenz
 *
 * For more information on the project go to
 * <https://github.com/philipptrenz/photo-booth>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, version 3.
 *
 * This program is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import fs from 'fs';
import sharp from 'sharp';
import LiveCam from 'livecam';


import utils from "../utils.js";

const io = require('socket.io-client');

const configRoot = utils.getConfig();
// const fps = configRoot.live ? configRoot.live.framerate : undefined;
const fps = 0; // let it run freely, so polling at inferior rates can work with low cpu usage
const config = utils.getConfig().livecam;
const simulate = config ? config.simulate : false;

const DEFAULT_CONFIG = {
	// address and port of the webcam UI
	ui_addr: '127.0.0.1',
	ui_port: 11000,

	// address and port of the webcam Socket.IO server
	// this server broadcasts GStreamer's video frames
	// for consumption in browser side.
	broadcast_addr: '127.0.0.1',
	broadcast_port: 12000,

	// address and port of GStreamer's tcp sink
	gst_tcp_addr: '127.0.0.1',
	gst_tcp_port: 10000,

	// callback function called when server starts
	start: function () {
		console.log('WebCam server started!');
	},

	// webcam object holds configuration of webcam frames
	webcam: {

		// should frames be converted to grayscale (default : false)
		grayscale: false,

		// should width of the frame be resized (default : 0)
		// provide 0 to match webcam input
		width: config.width || 0,

		// should height of the frame be resized (default : 0)
		// provide 0 to match webcam input
		height: config.height || 0,

		// should a fake source be used instead of an actual webcam
		// suitable for debugging and development (default : false)
		fake: false,

		// framerate of the feed (default : 0)
		// provide 0 to match webcam input
		framerate: fps || 0,

		// macos only: select the webcam via index
		//deviceIndex: 1
	}
};

const listener = (preview, callback) => (self, data) => {
	let filename;
	if (preview) {
		self.previewListener = undefined;
		// console.log("handling preview video frame");
		callback(0, data, undefined);
	} else {
		// console.log("handling picture frame");
		filename = "img_" + utils.getTimestamp() + ".jpg";
		self.captureListener = undefined;
		const binData = Buffer.from(data, 'base64');
		self._resizeAndSave(binData, filename, callback);
	}
}

class Camera {

	constructor() {
		this.previewListener = undefined; // for live video preview
		this.captureListener = undefined; // for photo capture
		this.currentFrame = undefined;
	}

	/*
	* Detect and configure camera
	*/
	initialize(callback) {
		// this.opts = {
		// 	...DEFAULT_CONFIG,
		// 	...config
		// };
		this.opts = DEFAULT_CONFIG;

		if (this.camera) {
			console.log("camera already initialized");
			if (callback) callback(true);
			return; // abort
		}

		try {
			const webcam_server = new LiveCam(this.opts);
			webcam_server.broadcast();
			this.camera = webcam_server;
			this.camera = {};
			if (callback) callback(true);
		} catch (err) {
			console.log(err);
			if (callback) callback(false, 'connection to webcam failed', err);
			return; // abort
		}

		const url = 'http://' + this.opts.broadcast_addr + ':' + this.opts.broadcast_port;
		console.log(`trying to connect to ${url}`);
		this.socket = io.connect(url);

		this.socket.on('image', (data) => {
			// console.log("received new frame @", Date.now());
			this.currentFrame = data;
			if (this.previewListener) this.previewListener(this, data);
			if (this.captureListener) this.captureListener(this, data);
		});

		this.socket.on('connect_error', (error) => {
			console.log('connect_error', error);
			setTimeout(() => {
				this.socket.connect();
			}, 1000);
		});

		this.socket.on('disconnect', (reason) => {
			console.log(`disconnect (${reason})`);
		});

		this.socket.on('data', (data) => {
			console.log(`data (${data.toString()})`);
		});

	}

	isInitialized() {
		return (this.camera !== undefined);
	}

	isConnected(callback) {
		if (callback) callback(this.camera !== undefined);
	}

	takePicture(callback, preview = false) {
		var self = this;

		if (self.camera === undefined) {
			callback(-1, 'camera not initialized', null);
			return;
		}

		if (simulate) {
			let filename;
			if (preview) {
				filename = "preview.jpg";
			} else {
				filename = "img_" + utils.getTimestamp() + ".jpg";
			}
			self._createSamplePicture(filename, callback);
		} else {
			if (preview && this.previewListener === undefined) {
				this.previewListener = listener(true, callback);
			} else if (!preview && this.captureListener === undefined) {
				this.captureListener = listener(false, callback);
			} else {
				console.log("listener already pending, expect frame drop");
			}
		}
	}

	_createSamplePicture(filename, callback) {
		var self = this;

		console.log('sample picture');

		const timestamp = utils.getTimestamp();
		const watermark = new Buffer(`<svg width="3000" height="2000">
				<rect x="0" y="0" width="3000" height="2000" stroke="transparent" stroke-width="0" fill="#f00" fill-opacity="0.5" />
				<text font-size="300" x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#000">${timestamp}</text>
			</svg>`);

		sharp(watermark)
			.jpeg()
			.toBuffer(function (err, data) {
				if (err) {
					callback(-2, 'failed to create sample picture', err);
				} else {
					self._resizeAndSave(data, filename, callback);
				}
			});
	}

	_resizeAndSave(data, filename, callback) {

		const filePath = utils.getFullSizePhotosDirectory() + filename;
		fs.writeFile(filePath, data, function (err) {
			if (err) {
				callback(-3, 'saving hq image failed', err);
			} else {
				callback(0, filePath, filePath);
			}
		});
	}
}

/*
 * Module exports for connection
 */
let camera = new Camera();
export { camera as default };