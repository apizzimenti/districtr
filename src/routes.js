import { listPlaces } from "./api/mockApi";
import { spatial_abilities } from "./utils";
import { renderModal } from "./components/Modal";

const routes = {
    "/": "/",
    "/new": "/new",
    "/edit": "/edit",
    "/embedded": "/embedded",
    "/COI": "/COI",
    "/plan": "/plan",
    "/register": "/register",
    "/request": "/request",
    "/signin": "/signin",
    "/signout": "/signout",
    "/analysis": "/analysis",
    "/evaluation": "/evaluation",
    "/eval": "/eval",
    "/coi-info": "/coi-info"
};

export function navigateTo(route) {
    if (routes.hasOwnProperty(route) || route.includes("?event=")) {
        location.assign(routes[route] || route);
    } else {
        throw Error("The requested route does not exist: " + route);
    }
}

export function startNewPlan(place, problem, units, id, setParts, eventCode, portalOn) {
    if (setParts) {
        problem.numberOfParts = setParts;
    }
    savePlanToStorage({ place, problem, units, id });
    let action = (window.location.hostname === "localhost" ? "edit" : (
      problem.type === "community" ? "COI" : "plan"
    ));
    if (portalOn) {
      eventCode += "&portal";
    }
    navigateTo(eventCode ? (`/${action}?event=${eventCode}`) : `/${action}`);
}

export function savePlanToStorage({
    place,
    problem,
    units,
    id,
    assignment,
    name,
    description,
    parts
}) {
    const state = {
        place,
        problem,
        units,
        id,
        assignment,
        name,
        description,
        parts
    };
    if (!window.location.href.includes("embed")) {
        localStorage.setItem("savedState", JSON.stringify(state));
    }
}

export function savePlanToDB(state, eventCode, planName, callback, forceNotScratch) {
    const serialized = state.serialize(),
        mapID = window.location.pathname.split("/").slice(-1)[0],
        token = localStorage.getItem("districtr_token_" + mapID) || "",
        createdAfter = (new Date() * 1) - 24 * 60 * 60 * 1000,
        tokenValid = (token && (token !== "null")
            && (token.split("_")[1] * 1 > createdAfter)),
        saveURL = tokenValid
            ? ("/.netlify/functions/planUpdate?id=" + mapID)
            : "/.netlify/functions/planCreate",
        requestBody = {
            plan: JSON.parse(JSON.stringify(serialized)),
            token: token.split("_")[0],
            eventCode: eventCode,
            planName: planName,
            isScratch: (document.getElementById("is-scratch") || {}).checked || (eventCode && !forceNotScratch),
            hostname: window.location.hostname
        };
    // VA fix - if precinct IDs are strings, escape any "."
    Object.keys(requestBody.plan.assignment || {}).forEach(key => {
        if (typeof key === "string" && key.indexOf(".") > -1) {
            requestBody.plan.assignment[key.replace(/\./g, "÷")] =
                requestBody.plan.assignment[key];
            delete requestBody.plan.assignment[key];
        }
    });
    fetch(saveURL, {
        method: "POST",
        body: JSON.stringify(requestBody)
    })
    .then(res => res.json())
    .then(info => {
        if (info.simple_id) {
            let action = (window.location.hostname === "localhost" ? "edit" : (
              serialized.problem.type === "community" ? "COI" : "plan"
            ));
            let extras = "";
            if (window.location.href.includes("portal")) {
                extras = "?portal";
            } else if (window.location.href.includes("qa-portal")) {
                extras = "?qa-portal";
            } else if (window.location.href.includes("event")) {
                const eventdefault = window.location.href.split("event=")[1].split("&")[0].split("#")[0];
                extras = "?event=" + eventdefault;
            }
            history.pushState({}, "Districtr", `/${action}/${info.simple_id}${extras}`);
            if (info.token && localStorage) {
                localStorage.setItem("districtr_token_" + info.simple_id, info.token + "_" + (1 * new Date()));
            }
            if (spatial_abilities(state.place.id).shapefile) {
                // screenshot
                if (
                  (state.place.id === state.place.state.toLowerCase() &&
                  ["blockgroups20", "vtds20"].includes(state.unitsRecord.id))
                    || ["new_mexico", "new_mexico_portal"].includes(state.place.id)
                ) {
                    fetch("https://gvd4917837.execute-api.us-east-1.amazonaws.com/plan_thumbnail", {
                      method: 'POST',
                      mode: 'cors',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({ id: info.simple_id }),
                    }).then((res) => res.text()).then(f => console.log('saved image'))
                } else {
                    fetch("//mggg.pythonanywhere.com/picture2?id=" + info.simple_id).then((res) => res.text()).then(f => console.log('saved image'))
                }
            }
            callback(info.simple_id, action);
        } else {
            callback(null);
        }
    })
    .catch(e => callback(null));
}

export function getContextFromStorage() {
    const savedState = window.location.href.includes("embed")
        ? null
        : localStorage.getItem("savedState");
    let state;
    try {
        state = JSON.parse(savedState);
//         if (state.place && state.units && state.units.columnSets && (state.place.id === "new_mexico") && window.location.href.includes("portal")) {
//             state.units.columnSets = state.units.columnSets.filter(c => c.type !== "election");
//         }
    } catch (e) {
        localStorage.removeItem("savedState");
        navigateTo("/new");
    }

    if (state === null || state === undefined) {
        navigateTo("/new");
    }

    return state;
}

export function loadPlanFromJSON(planRecord) {
    if (planRecord.msg && planRecord.plan) {
        // retrieved from database
        console.log(planRecord.msg);
        planRecord = planRecord.plan;
    }
    Object.keys(planRecord.assignment || {}).forEach((key) => {
        if (String(key).includes('÷')) {
            let newKey = key.replace(/÷/g, ".");
            planRecord.assignment[newKey] = planRecord.assignment[key];
            delete planRecord.assignment[key];
        }
    });
    if (planRecord.placeId === "nc") {
        planRecord.placeId = "northcarolina";
    }
    return listPlaces(planRecord.placeId, (planRecord.state || (planRecord.place ? planRecord.place.state : null))).then(places => {
        const place = places.find(p => String(p.id).replace(/÷/g, ".") === String(planRecord.placeId));
        if (place) {
            place.landmarks = (planRecord.place || {}).landmarks;
            planRecord.units = place.units.find(u => (u.name === planRecord.units.name) || (u.name === "Wards" && planRecord.units.name === "2011 Wards") || (u.name === "2011 Wards" && planRecord.units.name === "Wards"));
        }
//         if (planRecord.place && (planRecord.place.id === "new_mexico") && planRecord.units && planRecord.units.columnSets && window.location.href.includes("portal")) {
//             // hide election data on New Mexico portal maps
//             planRecord.units.columnSets = planRecord.units.columnSets.filter(c => c.type !== "election");
//         }
        return {
            ...planRecord,
            place
        };
    });
}

function _loadPlanFromCSV(assignment) {
    // 
}

/**
 * 
 * @param {String} assignmentList Delimited 
 * @param {*} state 
 */
export function loadPlanFromCSV(assignmentList, state) {
    // Request parameters and base error text.
    let URL = "https://gvd4917837.execute-api.us-east-1.amazonaws.com/loadPlanFromCSV",
        params = {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            "body": assignmentList
        },
        baseErrorText = `The uploaded CSV assignment and districtr module (state, \
            region, or legislative chamber) are incompatible. `,
        place;

    // Send the request to lambda.
    return fetch(URL, params)
        .then(r => r.json())
        .then(body => {
            // De-structure the assignment and numberOfParts.
            let { assignment, numberOfParts } = body;

            // First, check whether there's the right number of districts. If
            // the CSV specifies more districts than the module requires, we
            // warn the user and abort the operation.
            if (state.problem.numberOfParts < numberOfParts) {
                renderModal(
                    `${baseErrorText} The ${state.place.state} ${state.problem.name} \
                    module can have at most ${state.problem.numberOfParts} districts, \
                    but the CSV assignment specifies ${numberOfParts} districts.`
                );
                throw new Error(`"CSV assignment and ${state.id} are incompatible.`);
            }

            // Next, attempt to assign units.
            state.assignment = assignment;
            place = state.place;

            return { ...state, place };
        });
}

export function loadPlanFromURL(url) {
    return fetch(url)
        .then(r => r.json())
        .then(loadPlanFromJSON);
}
