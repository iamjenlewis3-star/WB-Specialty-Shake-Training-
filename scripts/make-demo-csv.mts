/* Generates sample legacy-LMS export files used to demonstrate the Migration Center. */
import fs from "node:fs";
import path from "node:path";
const { query } = await import("../src/lib/db/client");

const out = path.join(process.cwd(), "demo-data");
fs.mkdirSync(out, { recursive: true });

const employees = await query<{ employee_id: string; first_name: string; last_name: string; email: string; location_name: string; position_title: string }>(
  `select e.employee_id, u.first_name, u.last_name, u.email, l.name as location_name, e.position_title
     from employees e join users u on u.id = e.user_id
     left join locations l on l.id = e.primary_location_id
    where l.name is not null order by e.employee_id limit 25`);
const courses = await query<{ code: string; title: string }>(
  `select code, title from courses where status = 'published' order by code limit 8`);

const csv = (rows: Array<Record<string, string>>) => {
  const headers = Object.keys(rows[0]);
  const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [headers.join(","), ...rows.map((r) => headers.map((h) => escape(String(r[h] ?? ""))).join(","))].join("\r\n");
};

// 1. Historical completions — includes deliberate problems so the wizard's
//    validation, matching and error reporting can be demonstrated live.
const history: Array<Record<string, string>> = [];
let seq = 900000;
employees.slice(0, 20).forEach((emp, i) => {
  courses.forEach((course, j) => {
    if ((i + j) % 3 === 0) return;
    const year = 2022 + ((i + j) % 3);
    const month = String(((i + j) % 12) + 1).padStart(2, "0");
    const day = String(((i * 3 + j) % 27) + 1).padStart(2, "0");
    history.push({
      "Record ID": `LMS-${seq++}`,
      "Employee ID": emp.employee_id,
      "Employee Name": `${emp.first_name} ${emp.last_name}`,
      "Course ID": course.code,
      "Course Name": course.title,
      "Course Version": "1.0",
      "Assigned Date": `${year}-${month}-01`,
      "Start Date": `${year}-${month}-${day}`,
      "Completion Date": `${year}-${month}-${day}`,
      "Completion Status": "Completed",
      "Score": String(78 + ((i * 7 + j * 3) % 22)),
      "Passing Score": "80",
      "Attempts": String(1 + ((i + j) % 2)),
      "Duration (minutes)": String(20 + ((i * 5 + j) % 60)),
    });
  });
});
// A course that never existed in the Academy catalog (imports with its legacy title).
history.push({
  "Record ID": `LMS-${seq++}`, "Employee ID": employees[0].employee_id,
  "Employee Name": `${employees[0].first_name} ${employees[0].last_name}`,
  "Course ID": "LEG-2019-BRAND", "Course Name": "2019 Brand Refresh Training", "Course Version": "1.0",
  "Assigned Date": "2019-04-01", "Start Date": "2019-04-08", "Completion Date": "2019-04-08",
  "Completion Status": "Completed", "Score": "95", "Passing Score": "80", "Attempts": "1", "Duration (minutes)": "45",
});
// An employee who does not exist (reported as an error row).
history.push({
  "Record ID": `LMS-${seq++}`, "Employee ID": "WB99999", "Employee Name": "Unknown Person",
  "Course ID": courses[0].code, "Course Name": courses[0].title, "Course Version": "1.0",
  "Assigned Date": "2023-01-02", "Start Date": "2023-01-03", "Completion Date": "2023-01-03",
  "Completion Status": "Completed", "Score": "88", "Passing Score": "80", "Attempts": "1", "Duration (minutes)": "30",
});
// A malformed date (reported as an error row).
history.push({
  "Record ID": `LMS-${seq++}`, "Employee ID": employees[1].employee_id,
  "Employee Name": `${employees[1].first_name} ${employees[1].last_name}`,
  "Course ID": courses[1].code, "Course Name": courses[1].title, "Course Version": "1.0",
  "Assigned Date": "2023-03-01", "Start Date": "2023-03-05", "Completion Date": "13/45/2023",
  "Completion Status": "Completed", "Score": "91", "Passing Score": "80", "Attempts": "1", "Duration (minutes)": "25",
});
// An exact duplicate of the first row (skipped as a duplicate).
history.push({ ...history[0] });
fs.writeFileSync(path.join(out, "legacy-historical-training.csv"), csv(history));

// 2. Employee roster
const roster = Array.from({ length: 12 }).map((_, i) => ({
  "Employee ID": `WB2${String(5000 + i)}`,
  "First Name": ["Marisol", "Dante", "Priya", "Colin", "Ayana", "Tomas", "Freya", "Emeka", "Rosa", "Nikhil", "Cara", "Levi"][i],
  "Last Name": ["Ferrer", "Whitlock", "Nair", "Brady", "Okonkwo", "Delacroix", "Lindberg", "Adeyemi", "Marquez", "Rao", "Sutton", "Hoffman"][i],
  "Email": `new.hire${i + 1}@wahlburgers.test`,
  "Location": employees[i % employees.length].location_name,
  "Position": ["Cook", "Server", "Host", "Bartender", "Prep Cook", "Busser"][i % 6],
  "Department": ["Back of House", "Front of House", "Bar"][i % 3],
  "Hire Date": `2026-0${(i % 8) + 1}-1${i % 9}`,
  "Status": i === 11 ? "Inactive" : "Active",
  "Last Login": "",
}));
fs.writeFileSync(path.join(out, "legacy-employees.csv"), csv(roster));

// 3. Certifications
const certs = await query<{ name: string }>(`select name from certifications order by name limit 5`);
const certRows = employees.slice(0, 15).map((emp, i) => ({
  "Employee ID": emp.employee_id,
  "Certification": certs[i % certs.length].name,
  "Issue Date": `2024-0${(i % 9) + 1}-1${i % 9}`,
  "Expiration Date": `2026-1${i % 2}-1${i % 9}`,
  "Status": i % 7 === 0 ? "Expired" : "Active",
}));
fs.writeFileSync(path.join(out, "legacy-certifications.csv"), csv(certRows));

console.log(`wrote ${history.length} history rows, ${roster.length} employees, ${certRows.length} certifications to demo-data/`);
process.exit(0);
