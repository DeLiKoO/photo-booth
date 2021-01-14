import gphoto2 from './gphoto2';
import fswebcam from './fswebcam';
import livecam from './livecam';

import utils from "../utils.js";

var camera;
if(utils.getConfig().cameraInterface === 'fswebcam') {
    camera = fswebcam;
} else if(utils.getConfig().cameraInterface === 'livecam') {
    camera = livecam;
} else {
    camera = gphoto2;
}

export { camera as default };