import { html, render } from "lit-html";
import ElectionResultsSection from "../components/Charts/ElectionResultsSection";
import RacialBalanceTable from "../components/Charts/RacialBalanceTable";
import AgeHistogramTable from "../components/Charts/AgeHistogramTable";
import OverlayContainer from "../layers/OverlayContainer";
import ContiguitySection from "../components/Charts/ContiguitySection";
import VRAEffectivenessTable from "../components/Charts/VRATable";
import VRAResultsSection from "../components/Charts/VRAResultsSection";
import { renderModal } from "../components/Modal";
import Button from "../components/Button";
import AbstractBarChart from "../components/Charts/AbstractBarChart";
import { Tab } from "../components/Tab";
import { CoalitionPivotTable } from "../components/Charts/CoalitionPivotTable";
import { spatial_abilities } from "../utils";
import PartisanSummarySection from "../components/Charts/PartisanSummary";

/**
 * @desc Creates a button which, when clicked, opens up a modal for charts.
 * @param {Tab} tab Tab object.
 * @returns {undefined}
 */
//
// function createAnalysisModal(tab) {
//     let target = document.getElementById("modal"),
//         chart = AbstractBarChart([0.3, 0.4], [0.3, 0.4],
//             {
//                 hlabels: ["30%", "40%"],
//                 vlabels: ["30%", "40%"],
//                 bins: [[0.3, 0.4]],
//                 heights: [0.35],
//                 title: "Partisan Bias",
//                 description: "This chart tells us about partisan bias scores."
//             }
//         ),
//         modal = renderModal(chart);
//
//     const onChange = (e) => render(modal, target);
//
//     tab.addSection(
//         () => html`
//             <div style="text-align: center;">
//                 ${Button("Analyze", "Analyze your complete plan.", onChange)}
//             </div>
//         `
//     );
// }
//

export default function EvaluationPlugin(editor) {
    const { state, toolbar } = editor;

    const showVRA = (state.plan.problem.type !== "community") && (spatial_abilities(state.place.id).vra_effectiveness);
    const tab = new Tab("evaluation", showVRA ? "Eval." : "Evaluation", editor.store);
    const VRAtab = new Tab("vra", "VRA", editor.store);

    if (state.population.subgroups.length > 1) {
        let mockColumnSet = state.population;
        if (spatial_abilities(state.place.id).coalition !== false) {
            let coalitionSubgroup = {
                data: [],
                key: 'coal',
                name: "Coalition population",
                getAbbreviation: () => "Coalition",
                getFractionInPart: function (p) {
                    let fullsum = 0,
                        selectSGs = state.population.subgroups.filter(sg => window.coalitionGroups[sg.key]);
                    selectSGs.forEach(sg => {
                        fullsum += sg.sum;
                        sg.data.forEach((val, idx) => this.data[idx] = (this.data[idx] || 0) + val);
                    });
                    this.sum = fullsum;
                    let portion = 0;
                    selectSGs.forEach((selected) => {
                        portion += selected.getFractionInPart(p);
                    });
                    return portion;
                },
                sum: 0,
                total: mockColumnSet.subgroups.length > 0 ? mockColumnSet.subgroups[0].total : 0
            };
            mockColumnSet = {
                ...mockColumnSet,
                subgroups: [].concat(mockColumnSet.subgroups.filter(x => x.total !== mockColumnSet.total_alt)).concat([coalitionSubgroup])
            };
        }

        tab.addRevealSection(
            "Population by Race",
            (uiState, dispatch) =>
                RacialBalanceTable(
                    "Population by Race",
                    mockColumnSet,
                    state.activeParts,
                    uiState.charts["Population by Race"],
                    dispatch
                ),
            {
                isOpen: false,
                activeSubgroupIndices: state.population.indicesOfMajorSubgroups()
            }
        );
    }
    
    if (state.vap) {
        tab.addRevealSection(
            "Voting Age Population by Race",
            (uiState, dispatch) =>
                RacialBalanceTable(
                    "Voting Age Population by Race",
                    state.vap,
                    state.activeParts,
                    uiState.charts["Voting Age Population by Race"],
                    dispatch
                ),
            {
                isOpen: state.population.subgroups.length > 1 ? false : true,
                activeSubgroupIndices: state.vap.indicesOfMajorSubgroups()
            }
        );
    }
    if (state.cvap) {
        tab.addRevealSection(
            "Citizen Voting Age Population by Race",
            (uiState, dispatch) =>
                RacialBalanceTable(
                    "Citizen Voting Age Population by Race",
                    state.cvap,
                    state.activeParts,
                    uiState.charts["Citizen Voting Age Population by Race"],
                    dispatch
                ),
            {
                isOpen: state.population.subgroups.length > 1 ? false : true,
                activeSubgroupIndices: state.cvap.indicesOfMajorSubgroups()
            }
        );
    }

    if (state.elections.length > 0) {
        tab.addRevealSection(
            "Partisan Balance Summary",
            (uiState, dispatch) => html`
                ${spatial_abilities(state.place.id).absentee
                    ? html`<div style="text-align:center">Election results include absentee votes</div>`
                    : null
                }
                ${PartisanSummarySection(
                    state.elections,
                    state.activeParts,
                    uiState,
                    dispatch
                )}`,
            {
                isOpen:
                    state.population.subgroups.length <= 1 &&
                    state.vap === undefined
                        ? true
                        : false
            }
        );
    }

    if (state.elections.length > 0) {
        tab.addRevealSection(
            "Election Details",
            (uiState, dispatch) => html`
                ${spatial_abilities(state.place.id).absentee
                    ? html`<div style="text-align:center">Election results include absentee votes</div>`
                    : null
                }
                ${ElectionResultsSection(
                    state.elections,
                    state.activeParts,
                    uiState,
                    dispatch
                )}`,
            {
                isOpen:
                    state.population.subgroups.length <= 1 &&
                    state.vap === undefined
                        ? true
                        : false
            }
        );
    }

    if (state.ages) {
        tab.addRevealSection(
            "Age Histograms",
            (uiState, dispatch) =>
                AgeHistogramTable(
                    "Age Histograms",
                    state.ages,
                    state.activeParts,
                    uiState.charts["Age Histograms"],
                    dispatch
                ),
            {
                isOpen: false
            }
        );
    }

    let lambda_contig = (state.unitsRecord.id === "blockgroups"
                        || state.unitsRecord.id === "blockgroups20"
                        || state.unitsRecord.id === "vtds20");
    
    if (state.plan.problem.type !== "community"
        && (state.units.sourceId !== "ma_towns")
        && ( (spatial_abilities(state.place.id).contiguity) 
              || lambda_contig)
        
    ) {
        tab.addRevealSection(
            "Contiguity",
            (uiState, dispatch) =>
                ContiguitySection(
                    state.parts,
                    state.contiguity,
                    lambda_contig ? 2 : spatial_abilities(state.place.id).contiguity,
                    state.place.state.toLowerCase().replace(" ", ""),
                    uiState,
                    dispatch
                ),
            {
                isOpen: false
            }
        );
    }

    // Set out a list of modules we're excluding (or differentiating) from the
    // typical set of VRA modules. TODO: this needs to be refactored, because
    // it's not a great way to do this.
    let excluded = [
            "ma_towns",
            "md_vra_Precinct"
        ];

    // If the VRA module loaded isn't in the list of 
    if (showVRA && !excluded.includes(state.units.sourceId)) {
        VRAtab.addRevealSection(
            "VRA Effectiveness Overview",
            (uiState, dispatch) =>
                VRAEffectivenessTable(
                    state.parts,
                    state.vra_effectiveness,
                    state.waiting,
                    state.place.id,
                    uiState,
                    dispatch
                ),
            {
                isOpen: false
            }
        );
    
        // VRAtab.addRevealSection(
        //     "VRA Alignment",
        //     (uiState, dispatch) =>
        //         VRAAlignmentTable(
        //             state.parts,
        //             state.vra_effectiveness,
        //             state.waiting,
        //             uiState,
        //             dispatch
        //         ),
        //     {
        //         isOpen: false
        //     }
        // );

        VRAtab.addRevealSection(
            "VRA District Details",
            (uiState, dispatch) =>
                VRAResultsSection(
                    "VRA District Details",
                    state.parts,
                    state.vra_effectiveness,
                    state.place.id,
                    uiState,
                    dispatch
                ),
            {
                isOpen: false,
                activePartIndex: 0,
                activeSubgroupIndices: [0,0]
            }
        );
    } else if (showVRA && state.units.sourceId === "md_vra_Precinct") {
        // Otherwise, because we have a special MD module, we want to adjust the
        // titles of the dropdown menus. Refactoring this should be included in
        // the above refactoring.
        VRAtab.addRevealSection(
            "Statewide Elections – District Details",
            (uiState, dispatch) =>
                VRAResultsSection(
                    "Statewide Elections – District Details",
                    state.parts,
                    state.vra_effectiveness,
                    state.place.id,
                    uiState,
                    dispatch
                ),
            {
                isOpen: true,
                activePartIndex: 0,
                activeSubgroupIndices: [0,0]
            }
        );
    }

    if (tab.sections.length > 0) {
        toolbar.addTab(tab);
    }

    if (VRAtab.sections.length > 0) {
        toolbar.addTab(VRAtab);
    }
}
