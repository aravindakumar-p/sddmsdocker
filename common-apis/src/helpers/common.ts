

/**
 * Converts the following format of date
 * '2023-02-01-10:58:00'
 * with timezone IST to UTC Date Obj
 * */
const convertExpiryIstToTs = (exp) => {
	try {
		const [ yyyy, mm, dd ] = exp.split("-");
		const [ hh, mmm, ss ] = exp.split("-")[3].split(":");
		const istDate = new Date(Date.UTC(yyyy, mm, dd,hh, mmm, ss)).getTime();
		const utcDate = istDate - (5*60+30)*60*1000;
		return new Date(utcDate);
	} catch (e) {
		return null;
	}

}

export default {
	convertExpiryIstToTs
}
