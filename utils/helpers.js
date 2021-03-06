import {manipulateAsync, SaveFormat} from "expo-image-manipulator";

export const scaledImageDimensionsInView = ({originalImageDimensions, viewDimensions}) => {
    const {orgWidth, orgHeight} = originalImageDimensions;

    const viewHeight = viewDimensions.height;
    const viewWidth = viewDimensions.width;

    const scaledHeight = viewWidth * orgHeight / orgWidth;
    const scaledWidth = viewHeight * orgWidth / orgHeight;

    return {
        scaledWidth: Math.min(viewWidth, scaledWidth),
        scaledHeight: Math.min(viewHeight, scaledHeight)
    };
}

/**
 * @desc Scale a full-size face crop to fit in shown viewport over original image
 * @param originalImageDimensions
 * @param viewDimensions
 * @param faceImage
 * @returns {{offsetTop: number, scaledHeight: *, width: number, scaledWidth: number, offsetLeft: number, height: number}}
 */
export const scaleAndPositionFaceBlurRelatively = ({
                                                       originalImageDimensions,
                                                       viewDimensions,
                                                       faceImage
                                                   }) => {

    const {orgHeight, orgWidth} = originalImageDimensions;

    const {scaledWidth, scaledHeight} = scaledImageDimensionsInView({
        originalImageDimensions,
        viewDimensions
    });

    const offsetTop = ((faceImage.y / orgHeight) * scaledHeight) + ((viewDimensions.height - scaledHeight) / 2);
    const offsetLeft = ((faceImage.x / orgWidth) * scaledWidth) + ((viewDimensions.width - scaledWidth) / 2);
    const height = (faceImage.height / orgHeight) * scaledHeight;
    const width = (faceImage.width / orgWidth) * scaledWidth;

    return {
        offsetTop,
        offsetLeft,
        height,
        width,
        scaledWidth,
        scaledHeight
    };
}

export const constrainCropToImageDimensions = (cropPosition, {width, height}) => {

    //x must be more than 0. Set 0.
    //y must be more than 0. Set 0.
    //w/h must not exceed image boundaries, constrain when needed

    const validX = cropPosition.x >= 0 ? cropPosition.x : 0;
    const validY = cropPosition.y <= width ? cropPosition.y : 0;
    const validWidth = cropPosition.x + cropPosition.width <= width ? cropPosition.width : width - cropPosition.x;
    const validHeight = cropPosition.y + cropPosition.height <= height ? cropPosition.height : height - cropPosition.y;
    const borderLeft = Math.min(validX, 200);
    const borderRight = Math.min(validWidth - validY, 200);
    //borderLeft
    //borderRight

    //200 or

    //640w
    //validy is 400 border = 640 - 400 or 200
    //validx is 10 width is 640 border is validx or 200

    return {
        x: validX,
        y: validY,
        width: validWidth,
        height: validHeight,
        borderLeft,
        borderRight
    }
}

/**
 * @desc Crop detected faces from given image and array of coords.
 * @param asset - image record with a uri to fullsized, width, height and faceData
 * @returns {Promise<[]>} - Array of cropped faces asynchronously
 */
export const cropFaces = async ({faceData, uri, width, height}) => {
    const faceCoords = (faceData && JSON.parse(faceData)) || [];
    if (!faceCoords.length) {
        return;
    }

    //Process cropping in SEQUENCE to conserve CPU resource
    const faces = [];
    for (let coord of faceCoords) {

        coord = constrainCropToImageDimensions(coord, {width, height});
        coord.isSelected = false; // default for if user selected this blur to edit
        coord.isHidden = false; //default for tracking if user hide this blur

        const crop = await manipulateAsync(
            uri,
            [{
                crop: {
                    originX: coord.x,
                    originY: coord.y,
                    width: coord.width,
                    height: coord.height
                }
            }],
            {compress: 0.8, format: SaveFormat.JPEG}
        )
            .catch((error) => {
                return console.warn(error);
            });
        faces.push({...coord, ...crop});
    }
    return faces;
};

export const getOrientation = (orientation) => {
    if (!orientation) {
        return 0;
    }
    const {beta, gamma} = orientation;

    const ABSOLUTE_GAMMA = Math.abs(gamma);
    const ABSOLUTE_BETA = Math.abs(beta);
    const isGammaNegative = Math.sign(gamma) === -1;

    if (ABSOLUTE_GAMMA <= 0.04 && ABSOLUTE_BETA <= 0.24) {
        return 0
    } else if (
        (ABSOLUTE_GAMMA <= 1.0 || ABSOLUTE_GAMMA >= 2.3) &&
        ABSOLUTE_BETA >= 0.5
    ) {
        return 0;
    } else {
        if (isGammaNegative) {
            return -90;
        } else {
            return 90;
        }
    }
};

export const mapLongPressToBlurredFace = ({tapCoords, croppedFaces, viewDimensions, originalImageDimensions}) => {
    let pressedIndex = false;

    croppedFaces.forEach((faceImage, index) => {
        if (pressedIndex) {
            return;
        }

        const {offsetTop, offsetLeft, height, width} = scaleAndPositionFaceBlurRelatively({
            originalImageDimensions,
            viewDimensions,
            faceImage
        });

        //check if tap is in bounds
        const validXStart = offsetLeft <= tapCoords.x;
        const validXEnd = offsetLeft + width >= tapCoords.x;
        const validYStart = offsetTop <= tapCoords.y;
        const validYEnd = offsetTop + height >= tapCoords.y;

        if (validXStart && validXEnd && validYStart && validYEnd) {
            pressedIndex = index;
        }
    });

    if (pressedIndex === false) {
        return ({
            isModifying: false
        });
    } else {
        return ({
            isModifying: true,
            modifyIndex: pressedIndex
        });
    }
}

/**
 * @desc custom key to manage efficient GallerySwiper re-renders
 * @param image
 * @param activeID
 * @param blurFaces
 * @param isModifyBlur
 * @returns {*}
 */
export const createRefKeyForImage = (image, activeID, blurFaces, isModifyBlur) => {
    const showFaces = blurFaces && activeID === image.id ? 1 : 0;
    const hasActiveBlur = (showFaces && isModifyBlur.isModifying) && isModifyBlur.modifyIndex >= 0 ? 1 : 0;
    return `${getFileNameExt(image.name)}#${showFaces}#${hasActiveBlur}`;
};

export const getFileNameExt = (path) => {
    return path && path.split('/').pop().split('.');
}

//UUID function https://www.arungudelli.com/tutorial/javascript/how-to-create-uuid-guid-in-javascript-with-examples/
export const createUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        let r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}
