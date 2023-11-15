/**
 * @author Lorenzo Catoni
 */

let calendar;
/** Main */
$(() => {
	Notiflix.Confirm.init({ okButtonBackground: "#04061e", titleColor: "#04061e", });
	Notiflix.Notify.init({ timeout: 2000, });
	Notiflix.Loading.init({ svgColor: "#383838", backgroundColor: "rgba(255,255,255,0.9)", messageColor: "#383838", });

	// override darkreader's 'color-scheme: dark' because it breaks the notion embed
	$('html').attr('style', 'color-scheme: light !important');
	DarkReader.setFetchMethod(window.fetch);
	const DarkReaderTheme = {"darkSchemeBackgroundColor": "#191919"};

	if (ObjDataStore.get("dark", false)) {
		DarkReader.enable(DarkReaderTheme);
		$("#dark-checkbox").prop("checked", true);
		$(".checkbox").addClass("dark");
	}

	$("#dark-checkbox").change(() => { // dark light toggle
		DarkReader.isEnabled() ? DarkReader.disable() : DarkReader.enable(DarkReaderTheme);
		ObjDataStore.set("dark", DarkReader.isEnabled());
		$(".checkbox").toggleClass("dark");
	});

	if (ObjDataStore.get("hide", false)) {
		$(".hideable").hide();
		$("#hide-checkbox").prop("checked", true);
	}

	$("#hide-checkbox").change(() => { // hide toggle
		ObjDataStore.set("hide", $(".hideable").is(":visible"));
		$(".hideable").toggle();
	});

	calendar = new PersistentSelfRedrawingCalendar();

	// search button/enter
	$("#form").submit(async (e) => {
		e.preventDefault();

		if ($("#docente").val() === "" && $("#insegnamento").val() === "" && $("#cds").val() === "") {
			Notiflix.Notify.failure('Inserire almeno un parametro di ricerca');
			return;
		}

		Notiflix.Loading.circle();
		const exams = await fetch_exams($("#docente").val(), $("#insegnamento").val(), $("#cds").val());
		Notiflix.Loading.remove();

		if (exams.length === 0) {
			Notiflix.Notify.failure('Nessun esame trovato');
			return;
		}

		const table = json_to_table_with_button(exams, addExam);
		$("#dropdown-result").empty().append(table);
		$(".dropdownable").addClass("show");
	});

	// 'x' button
	$("#clear-dropdown").click((e) => {
		e.preventDefault();

		$("#docente").val("");
		$("#insegnamento").val("");
		$("#cds").val("");

		$(".dropdownable").removeClass("show");
	});

	// close dropdown on click outside
	$("#dropdown-fullscreen").click(() => {
		$(".dropdownable").removeClass("show");
	});

	// download button
	$('#download').click(() => {
		if (calendar.events.length === 0) {
			Notiflix.Notify.failure('Nessun esame presente nel calendario');
			return;
		}
		calendar.download();
	});

	// share button
	$('#share').click(async () => {
		try {
			await navigator.clipboard.writeText(location.href);
			Notiflix.Notify.success('Link copied to clipboard!', { timeout: 1000 });
		} catch (err) {
			// should basically never happen
			console.log(err);
			Notiflix.Notify.failure('Errore nel copiare il link nella clipboard');
		}
	});

	// clear button
	$('#clear').click(async () => {
		if (await (new Promise(res => {
			Notiflix.Confirm.show(
				'Confirm', 'Sei sicuro di voler cancellare tutti gli esami dal calendario?',
				'Si', 'No', () => res(true), () => res(false))
		}))) {
			calendar = new PersistentSelfRedrawingCalendar([]);
		}
	});
});


/**
 * Store Objects in the URL fragment, expose get and set methods, compress and decompress using LZString.
 * @see https://github.com/EastingAndNorthing/urlhash
 * @see https://github.com/pieroxy/lz-string
 */
const ObjDataStore = (function () {
	const compress = LZString.compressToEncodedURIComponent;
	const decompress = LZString.decompressFromEncodedURIComponent;
	const get_kv_obj = function () {
		try {
			return document.location.hash.substring(1).split('&').filter(e => e).reduce((acc, cur) => {
				const [key, value] = cur.split('=').map(decodeURIComponent);
				acc[key] = value;
				return acc;
			}, {});
		} catch {
			return {};
		}
	};

	// expose only get and set methods
	return {
		'get': function (key, default_value) {
			try {
				return JSON.parse(decompress(get_kv_obj()[key]));
			} catch {
				return default_value;
			}
		},
		'set': function (key, value) {
			const obj = get_kv_obj();
			obj[key] = compress(JSON.stringify(value));
			const hash = Object.entries(obj).map(([key, value]) => `${key}=${value}`).join('&');
			document.location.hash = hash;
		}
	};
})();

/** Calendar class (glorified array of events). */
class Calendar {
	/** Creates a new calendar. */
	constructor(events = []) {
		this.events = events;
	}

	/**
	 * Adds an event to the calendar.
	 * @param {string} title - The title of the event.
	 * @param {string} description - The description of the event.
	 * @param {string} location - The location of the event.
	 * @param {Date} start - The start date of the event.
	 * @param {Date} end - The end date of the event.
	 */
	addEvent(title, description, location, start, end) {
		this.events.push({ title, description, location, start, end });
	}

	/**
	 * Removes an event from the calendar, 
	 * @see {@link Calendar.addEvent} for parameters.
	 */
	removeEvent(title, description, location, start, end) {
		this.events = this.events.filter(e => !(JSON.stringify(e) == JSON.stringify({ title, description, location, start, end })));
	}

	/**
	 * Checks if an event is in the calendar.
	 * @see {@link Calendar.addEvent} for parameters.
	 */
	hasEvent(title, description, location, start, end) {
		return this.events.some(e => JSON.stringify(e) == JSON.stringify({ title, description, location, start, end }));
	}

	/**
	 * Downloads the calendar, use ics.js to generate the file.
	 * @see https://github.com/nwcell/ics.js/
	 */
	download() {
		const cal = ics();
		this.events.forEach(e => cal.addEvent(e.title, e.description, e.location, e.start, e.end));
		cal.download('calendar-esami-unipi');
	}
}

/** Calendar class that saves itself to the URL fragment and redraws itself when it changes. */
class PersistentSelfRedrawingCalendar extends Calendar {
	constructor(events) {
		super(events ?? ObjDataStore.get("c", []));
		ObjDataStore.set("c", this.events);
		drawCalendar(this.events);
	}

	addEvent(title, description, location, start, end) {
		super.addEvent(title, description, location, start, end);
		ObjDataStore.set("c", this.events);
		drawCalendar(this.events);
	}

	removeEvent(title, description, location, start, end) {
		super.removeEvent(title, description, location, start, end);
		ObjDataStore.set("c", this.events);
		drawCalendar(this.events);
	}
}

/**
 * Adds an exam to the calendar, handling the case where the exam is already in the calendar, called by the "Aggiungi" button.
 * @param {Object} exam - the exam to add.
 */
async function addExam(exam) {
	// Date that preserves the timezone when serialized to JSON.
	class JSONSafeDate extends Date {
		toJSON() { return moment(this).format(); }
	}
	const start = new JSONSafeDate(moment(exam["Data e ora"], "DD/MM/YYYY HH:mm").toDate());
	const end = new JSONSafeDate(start.getTime() + 60 * 60 * 1000 * 2); // 2 hours

	const toTitleCase = (str) => str.split(' ').map(e => e.charAt(0).toUpperCase() + e.slice(1).toLowerCase()).join(' ');
	const args = [
		['Insegnamento', 'Tipo'].map(e => toTitleCase(exam[e])).filter(e => e).join(' - '),
		`Docente: ${toTitleCase(exam["Docente"])} - Codice: ${exam["Codice"]} - CFU: ${exam["CFU"]}`,
		exam["Sede"], start, end
	];

	// If the event is already in the calendar, ask the user if they want to remove it
	if (calendar.hasEvent(...args)) {
		if (await (new Promise(res => {
			Notiflix.Confirm.show('Confirm', 'Esame già presente nel calendario, rimuoverlo?', 'Si', 'No', () => res(true), () => res(false))
		}))) {
			calendar.removeEvent(...args);
			Notiflix.Notify.success('Esame rimosso dal calendario!', { timeout: 1000 });
		}
	} else {
		// Add the event to the calendar
		calendar.addEvent(...args);
		Notiflix.Notify.success('Esame aggiunto al calendario!', { timeout: 1000 });
	}
}

/**
 * Converts a JSON object into an HTML table with a button per row.
 * @param {Object} json - The JSON object to convert to an HTML table.
 * @param {Function} onclick - The function to call when the button is clicked.
 * @returns {HTMLElement} - The HTML table element.
 */
const json_to_table_with_button = (json, onclick) => {
	// Create the table element
	let table = document.createElement("table");

	if (!json || json.length === 0)
		return table;

	// Create the table headers
	let headers = Object.keys(json[0]);
	let headerRow = document.createElement("tr");

	// one empty cell for the button
	headerRow.appendChild(document.createElement("th"));
	headers.forEach((header) => {
		let th = document.createElement("th");
		th.innerText = header;
		headerRow.appendChild(th);
	});
	table.appendChild(headerRow);

	// Create the table rows
	json.forEach((data) => {
		let row = document.createElement("tr");

		// Add the button
		let button = document.createElement("button");
		button.innerText = "Aggiungi";
		button.onclick = () => onclick(data);
		let td = document.createElement("td");
		td.appendChild(button)
		row.appendChild(td);

		headers.forEach((header) => {
			let td = document.createElement("td");
			td.innerText = data[header];
			row.appendChild(td);
		});
		table.appendChild(row);
	});

	return table;
}

const CORS_PROXY = "https://corsproxy.io/";
const ESAMI_UNIPI = "https://esami.unipi.it/elencoappelli.php";
/**
 * Fetches the exams from the esami.unipi.it website and returns them as an array of objects.
 * @param {String} d - The name of the teacher (*d*ocente).
 * @param {String} i - The name of the course (*i*nsegnamento).
 * @param {String} c - The name of the CdS (*c*orso di studio).
 * @returns {Array} - An array of objects where the keys are the table headers.
 */
async function fetch_exams(d, i, c) {
	const e = encodeURIComponent;
	const url = `${CORS_PROXY}?${ESAMI_UNIPI}?from=sappelli&docente=${e(d)}&insegnamento=${e(i)}&cds=${e(c)}&cerca=`;

	let text;
	try {
		const res = await fetch(url);
		if (!res.ok) throw new Error("Bad response", res);
		text = await res.text();
	} catch (err) {
		console.log(err);
		Notiflix.Notify.failure('Errore nel caricamento degli esami');
		return [];
	}

	// parse the html response
	const doc = (new DOMParser()).parseFromString(text, "text/html");
	const table = doc.getElementById("datatable-esami");

	/**
	 * Utility function to Convert an HTML table element to an array of objects with keys as table headers.
	 * @param {HTMLElement} table - The table element to convert to JSON.
	 * @param {Object} [override_header_name={}] - An object where the keys are the index of the column and the values are the new name of the column.
	 * @param {Object} [column_handler={}] - An object where the keys are the name of the column and the values are functions that take the cell element and return the value of the cell.
	 * @returns {Array} - An array of objects where the keys are the table headers.
	 */
	const table_to_json = (table, override_header_name = {}, column_handler = {}) => {
		let index_to_name = {};
		$(table).find("> thead > tr > th").each((i, e) => index_to_name[i] = e.innerText);
		index_to_name = { ...index_to_name, ...override_header_name };

		let res = [];
		$(table).find("> tbody > tr").each(function () {
			let obj = {};
			$(this).find("> td").each(function (i, e) {
				let name = index_to_name[i];
				obj[name] = column_handler[name] ? column_handler[name](e) : e.innerText;
			});
			res.push(obj);
		});
		return res;
	}

	// parse the table (and the nested table) to json
	let json = table_to_json(
		table,
		{ 0: "info" },
		{ "info": e => table_to_json($(e).find("table.table-appelli")) }
	);

	// flatten the json and keep only the keys we need
	const keep_keyes = ["AA", "CdS", "Insegnamento", "Codice", "CFU", "Docente", "Tipo", "Data e ora", "Sede"]
	const filtered_json = []
	json.forEach(e => {
		e.info.forEach(f => {
			let obj = {};
			keep_keyes.forEach(k => obj[k] = { ...e, ...f }[k]);
			filtered_json.push(obj);
		});
	});

	return filtered_json;
}

const EVENT_COLORS = ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd", "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf"];
/**
 * Draws the calendar using the fullcalendar.io library
 * @see https://fullcalendar.io/
 * @param {Array} events - An array of events.
 */
function drawCalendar(events) {
	// popup with event info when an event is clicked, and a button to remove the event
	const event_popup = (info) => {
		Notiflix.Report.info(
			// info displayed in the popup
			info.title,
			[
				`Data e ora: ${info.start.format('DD/MM/YYYY HH:mm')}`,
				info.location?.match(/^\s*$/g) ? '' : `Sede: ${info.location}`,
				...info.description.split(' - '),
			].filter(e => e).join('<br/>'),
			'<i class="fa-regular fa-trash-can"></i>',

			// callback when the popup is closed via the button
			async () => {
				if (await (new Promise(res => {
					Notiflix.Confirm.show(
						'Confirm', 'Vuoi rimuovere l\'evento dal calendario?',
						'Si', 'No', () => res(true), () => res(false))
				}))) {
					const s = info._self;
					calendar.removeEvent(s.title, s.description, s.location, s.start, s.end);
					Notiflix.Notify.success('Esame rimosso dal calendario!', { timeout: 1000 });
				}
			},

			// options
			{
				svgSize: "0px",
				backOverlayClickToClose: true,
				plainText: false,
				titleMaxLength: 128,
				buttonMaxLength: 100,
				buttonFontSize: "1.2rem",
				info: {
					titleColor: info.color,
					buttonBackground: info.color,
					backOverlayColor: "",
				}
			}
		);
	}

	$("#calendar").fullCalendar({
		header: {
			left: "prev,next today",
			center: "title",
			right: "month,agendaWeek,agendaDay,listMonth",
		},
		navLinks: true,
		editable: false,
		minTime: "7:30:00",
		maxTime: "21:30:00",
		eventClick: event_popup,
	});

	// Assign same color to same exam name, add reference to self for easy access in the event_popup function
	let color_map = {};
	const colors_iter = EVENT_COLORS.values();
	events = events.map(e => {
		return { ...e, color: color_map[e.title.split('-')[0]] || (color_map[e.title.split('-')[0]] = colors_iter.next().value), _self: e };
	});

	$("#calendar").fullCalendar("removeEventSources");
	$("#calendar").fullCalendar("addEventSource", events);
}