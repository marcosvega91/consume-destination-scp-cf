const cfenv = require('cfenv');
const request = require('request');
const httpMethodsEnum = require('http-methods-enum');

/**
 * @param {Map} oOptions - configuration for CloudFoundry destination service instance
 * @param {string} [oOptions.url] - the url to call in the destination, absolute path (including leading slash) e.g. /api/v1/json
 * @param {string} oOptions.destinationInstance - name of the instance of the destination service
 * @param {string} oOptions.destinationName - name of the destination to use
 * @param {('GET'|'POST'|'PUT'|'PATCH'|'DELETE'|'HEAD'|'OPTIONS')} oOptions.httpMethod - HTTP method to use on Destination
 * @param {object} [oOptions.payload] - payload for POST, PUT or PATCH
 * @returns {Promise.<Any>} - Promise object represents the destination call
 */
async function doItNow(oOptions) {
    if (!httpMethodsEnum.default.hasOwnProperty(oOptions.httpMethod)) {
        throw Error(`Unknown HTTP method: ${oOptions.httpMethod}. Allowed methods: ${JSON.stringify(httpMethodsEnum)}`);
    }

    if (!oOptions.destinationInstance) {
        throw Error('Invalid destination service instance');
    }

    if (!oOptions.destinationName) {
        throw Error('Invalid destination name');
    }

    return getToken(oOptions.destinationInstance)
    .then(sToken => {
        return getDestination(sToken, oOptions.destinationInstance, oOptions.destinationName);
    })
    .then(oDestination => {
        let oParameters = {
            url: oOptions.url,
            destination: oDestination,
            httpMethod: oOptions.httpMethod,
            payload: oOptions.payload
        };
        return callDestination(oParameters);
    });
}

/**
 * call the url in a destination
 * @param {Map} oParameters - parameters to configure the call
 * @param {string} [oParameters.url] - the absolute path (e.g. /my/api) to call in the destination
 * @param {object} oParameters.destination - destination object
 * @param {('GET'|'POST'|'PUT'|'PATCH'|'DELETE'|'HEAD'|'OPTIONS')} oParameters.httpMethod
 * @param {object} [oParameters.payload] - payload for POST, PUT or PATCH
 * @returns {Promise.<Any>} - Promise object represents the destination call
 */
async function callDestination(oParameters) {
    let oDestination = oParameters.destination;
    let oOptions = {
        method: oParameters.httpMethod,
        url: `${oDestination.destinationConfiguration.URL}`
    };

    if (oParameters.url) {
        oOptions.url += oParameters.url;
    }

    if (oDestination.authTokens && oDestination.authTokens[0]) {
        let oToken = oDestination.authTokens[0];
        oOptions.headers = {
            'Authorization': `${oToken.type} ${oToken.value}`
        };
    }

    if (oParameters.payload && isPostPutPatch(oParameters.httpMethod)) {
        oOptions.payload = oParameters.payload
    }

    return new Promise((resolve, reject) => {
        request(oOptions, (error, response, data) => {
            if (error) {
                reject(error);
            } else {
                resolve(data);
            }
        });
    });
}

/**
 * check if the http method is POST, PUT or PATCH
 * @param {string} sMethod - http method
 * @returns {boolean}
 */
function isPostPutPatch(sMethod) {
    return sMethod == httpMethodsEnum.POST || sMethod == httpMethodsEnum.PUT || sMethod == httpMethodsEnum.PATCH;
}

/**
 * get the destination from destination service
 * @param {string} sToken - JWT token to access the destination service
 * @param {string} sDestinationName - destination name
 * @returns {Promise.<Any>} - Promise object represents the destination
 */
async function getDestination(sToken, sDestinationInstance, sDestinationName) {
    return new Promise((resolve, reject) => {
        let oDestinationService = cfenv.getAppEnv({
            vcapFile: './module/cfenv.json'
        }).getService(sDestinationInstance);

        request({
            url: `${oDestinationService.credentials.uri}/destination-configuration/v1/destinations/${sDestinationName}`,
            headers: {
                'Authorization': `Bearer ${sToken}`
            }
        }, (error, response, data) => {
            if (error) {
                reject(error);
            } else if (response.statusCode == 200) {
                resolve(JSON.parse(data));
            } else {
                reject(`Server responded with status code ${response.statusCode} when requesting the destination from destination service`);
            }
        });
    });
}

/**
 * get a JWT token to access the destination service
 * @param {string} sDestinationInstance - destination service instance name
 * @returns {Promise.<string>} - Promise object represents the token
 */
async function getToken(sDestinationInstance) {
    return new Promise((resolve, reject) => {
        let oDestinationService = cfenv.getAppEnv({
            vcapFile: './module/cfenv.json'
        }).getService(sDestinationInstance);
        let sCredentials = `${oDestinationService.credentials.clientid}:${oDestinationService.credentials.clientsecret}`;

        request({
            url: `${oDestinationService.credentials.url}/oauth/token`,
            method: 'POST',
            headers: {
                'Authorization': `Basic ${Buffer.from(sCredentials).toString('base64')}`,
                'Content-type': 'application/x-www-form-urlencoded'
            },
            form: {
                'client_id': oDestinationService.credentials.clientid,
                'grant_type': 'client_credentials'
            }
        }, (error, response, data) => {
            if (error) {
                reject(error);
            } else if (response.statusCode == 200) {
                let sToken = JSON.parse(data).access_token;
                resolve(sToken);
            } else {
                reject(`Server responded with status code ${response.statusCode} when requesting the JWT token`);
            }
        });
    });
}

module.exports = doItNow;
