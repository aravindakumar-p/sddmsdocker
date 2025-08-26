import Getters from '../db/getters';

export default class helperController {

	 generateLink = async (len: number, caseType: any) => {
		try {


			let chars;
			switch (caseType) {
				case 'uppercase':
					chars = 'ABCDEFGHIJKLMNPQRSTUVWXYZ123456789'; // Excluding 'O' and '0'
					break;
				case 'lowercase':
					chars = 'abcdefghijklmnpqrstuvwxyz123456789'; // Excluding 'o' and '0'
					break;
				case 'mixed':
				default:
					chars = 'ABCDEFGHIJKLMNPQRSTUVWXYZabcdefghijklmnpqrstuvwxyz123456789'; // Excluding 'O', 'o', and '0'
					break;
			}
			return [...Array(len)].map(() => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
		} catch (e) {
			return null;
		}
	};
}
