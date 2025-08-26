var crypto = require('crypto');

/**
 * Converts the following format of date
 * '2023-02-01-10:58:00'
 * with timezone IST to UTC Date Obj
 * */
const convertExpiryIstToTs = (exp) => {
	const [ yyyy, mm, dd ] = exp.split("-");
	const [ hh, mmm, ss ] = exp.split("-")[3].split(":");
	const istDate = new Date(Date.UTC(yyyy, mm, dd,hh, mmm, ss)).getTime();
	const utcDate = istDate - (5*60+30)*60*1000;
	return new Date(utcDate);
}

function getRandomItem(arr) {
	// get random index value
	const randomIndex = Math.floor(Math.random() * arr.length);

	// get random item
	const item = arr[randomIndex];

	return item;
}


function randomString(length, config) {
    let chars = '';
    if (!config) {
        chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    } else {
        const { number, text } = config;
        if (number) {
            chars+='0123456789'
        }
        if (text) {
            chars+='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
        }
    }
    var result = '';
    for (var i = length; i > 0; --i) result += chars[Math.floor(Math.random() * chars.length)];
    return result;
}

function shuffle(array) {
    return array.sort(() => Math.random() - 0.5);
}

const encryptionSecret = "samplePassword";
const encryptText = (normalText)=>{
    const cipher = crypto.createCipher('aes192', encryptionSecret);
    var encrypted = cipher.update(normalText, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
}

const decryptText = (encryptedText)=>{
    const decipher = crypto.createDecipher('aes192', encryptionSecret);
    var decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

export default {
	convertExpiryIstToTs,
    randomString,
    encryptText,
    decryptText,
    shuffle,
	getRandomItem
}
