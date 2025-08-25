export const formatDate = (date: Date) => {
	const day = String(date.getDate()).padStart(2, '0');
	const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are zero-based
	const year = String(date.getFullYear());

	return `${day}-${month}-${year}`;
};

export const convertToIndianRupees = (number: number, symbol = true) => {
	if (number != null && number) {
		const rupeeSymbol = '\u20B9'; // Unicode character for the Indian Rupee symbol
		const numberString = number.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
		if (symbol) {
			return ` ${rupeeSymbol}${numberString}`;
		} else {
			return numberString;
		}
	} else {
		return '';
	}
};
