import gphoto2 from './gphoto2';
import fswebcam from './fswebcam';

var camera;
if(utils.getConfig().cameraInterface === 'fswebcam') {
    camera = fswebcam;
} else {
    camera = gphoto2;
}

export { camera as default };