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
import webcam from 'node-webcam';


import utils from "../utils.js";

const config = utils.getConfig().fswebcam;
const simulate = config ? config.simulate : false;



class Camera {

	constructor() {
	}

	/*
	* Detect and configure camera
	*/
	initialize(callback) {
		const keep = utils.getConfig().fswebcam.keep === true ?  true : false;
		this.opts = {
			// defaults to 1080p, should be configurable
			width: 1920,
			height: 1080,
			// keep in camera memory
			saveShots: keep,
			// as of now, we will only support jpeg, all alike the original gphoto2 implementation
			output: "jpeg",
			// default device, use webcam.list() to get a list of cameras
			device: false,
			// retrieve image buffer, all alike the original gphoto2 implementation
			callbackReturn: "buffer",
			verbose: true, // enable logging, for now
		};
		if(this.camera) {
			console.log("camera already initialized");
			if (callback) callback(true);
		} else {
			try {
				this.camera = webcam.create(this.opts);
				if (callback) callback(true);
			} catch (err) {
				console.log(err);
				if (callback) callback(false, 'connection to webcam failed', err);
			}
		}
	}

	isInitialized() {
		return (this.camera !== undefined);
	}

	isConnected(callback) {
		if (callback) callback(this.camera !== undefined);
	}

	takePicture(callback, preview = false) {
		let filename;
		if(preview) {
			filename = "img_" + utils.getTimestamp() + ".jpg";
		} else {
			filename = "preview.jpg";
		}
		if (simulate) {
			this._createSamplePicture(filename, callback);
		} else {
			this._takePictureWithCamera(filename, callback);
		}
	}

	_takePictureWithCamera(filename, callback) {
		var self = this;

		if (self.camera === undefined) {
			callback(-1, 'camera not initialized', null);
			return;
		}

		const keep = utils.getConfig().fswebcam.keep === true ?  true : false;

		self.camera.capture("photobooth_capture", function (err, data) {

			if (err) {
				self.camera = undefined;	// needs to be reinitialized
				callback(-2, 'connection to camera failed', err);
				return;
			}
		
			self._resizeAndSave(data, filename, callback);
		});
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

		function resizeInternal() {
			const resizedFilePath = utils.getPhotosDirectory() + filename;
			const webFilepath = 'photos/' + filename;
			// const maxImageSize = utils.getConfig().maxImageSize ? utils.getConfig().maxImageSize : 1500;

			sharp(data) // resize image to given maxSize
				//.resize(Number(maxImageSize)) // scale width to 1500
				.toFile(resizedFilePath, function(err) {
					if (err) {
						callback(-3, 'resizing image failed', err);
					} else {
						callback(0, resizedFilePath, webFilepath);
					}
				});
		}

		if (utils.getConfig().printing.enabled) {
			const filePath = utils.getFullSizePhotosDirectory() + filename;
			fs.writeFile(filePath, data, function(err) {
				if (err) {
					callback(-3, 'saving hq image failed', err);
				} else {
					resizeInternal();
				}
			});
		} else {
			resizeInternal();
		}
	}
}

/*
 * Module exports for connection
 */
let camera = new Camera();
export { camera as default };