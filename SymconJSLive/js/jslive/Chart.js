class JSLive_Chart {
    constructor(instanceID, config_global, configuration) {
        this.myChart;

        this.instanceID = instanceID;
        this.config_global = config_global;
        this.configuration = configuration;

        this.config_dataset = configuration["dataset"];
        this.config_axes = configuration[""];
        this.config_legend = configuration[""];
        this.config_tooltips = configuration[""];
        this.config_title = configuration[""];
        this.config_xaxes = configuration[""];

        this.update_vars = [];
        this.update_vars_Values = [];

        this.update_vars.push(configuration.ID_Period);
        this.update_vars.push(configuration.ID_Now);
        this.update_vars.push(configuration.ID_StartDate);
        this.update_vars.push(configuration.ID_Relativ);

        this.last_update = Date.now();
        this.offset_isSet = false;
        this.last_reload = 0; //Damit der Chart nur einmal neugeladen wird!
        this.isReloading = true;
        this.pullMode = false;
        this.pullModeStopping = false;

        this.bootUp();
    }


    updateChartconfig() {
        try {
            //Eneable Datalabels
            Chart.register(ChartDataLabels);

            //set Window to canvas
            var ctx = document.getElementById('chart-container');
            ctx.style.width = Get_WindowWidth() - 20+"px";
            ctx.style.height = Get_WindowHeight() - 20+"px";

            //modify dataset
            config_dataset.forEach(function (part, index) {
                if (config_dataset[index]["type"] == 'line') {
                    //config_dataset[index]["lineTension"] = 0;
                }
            });

            var config = {
                type: 'line',
                data: {
                    datasets: config_dataset
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    indexAxis: 'x',
                    animation: {
                        duration: configuration.animation_duration,
                        easing: configuration.animation_easing,
                    },
                    hover: {
                        animationDuration: 0           // duration of animations when hovering an item
                    },
                    responsiveAnimationDuration: 0,    // animation duration after a resize
                    plugins: {
                        tooltip: config_tooltips,
                        title: config_title,
                        legend: config_legend,
                        datalabels: {
                            display: false,
                            align: configuration.datalabels_align,
                            anchor: configuration.datalabels_anchoring,
                            offset: configuration.datalabels_offset,

                            borderRadius: configuration.datalabels_borderRadius,
                            borderWidth: configuration.datalabels_borderWidth,
                            font: {
                                size: configuration.datalabels_fontSize,
                                family: configuration.datalabels_fontFamily
                            },
                            color: configuration.datalabels_fontColor,
                            clip: true,
                            clamp: false,
                            formatter: function(value, context) {
                                var precision = Math.pow(10, configuration.data_precision);
                                var str  = Math.floor(value["y"] * precision) /  precision;
                                if(str === 0 || str === null || str === "") return "";

                                if(context.dataset.datalabels.showPrefix){
                                    str = context.chart.config.options.scales[context.dataset.yAxisID].Prefix + str;
                                }
                                if(context.dataset.datalabels.showSuffix){
                                    str = str + context.chart.config.options.scales[context.dataset.yAxisID].Suffix;
                                }

                                return  str;
                            },
                            backgroundColor: function(context) {
                                var str = context.dataset.data[context.dataIndex].y;
                                if(str === 0 || str === null || str === "") return "rgba(0,0,0,0)";
                                if(context.dataset.datalabels.useBackgroundColor){
                                    return context.dataset.backgroundColor;
                                }else{
                                    return context.dataset.datalabels.BackgroundColor;
                                }
                            },
                            borderColor: function(context) {
                                var str = context.dataset.data[context.dataIndex].y;
                                if(str === 0 || str === null || str === "") return "rgba(0,0,0,0)";
                                if(context.dataset.datalabels.useBorderColor){
                                    return context.dataset.borderColor;
                                }else{
                                    return context.dataset.datalabels.BorderColor;
                                }
                            }
                        }
                    },
                    scales: Object.assign(config_axes, {x: config_xaxes}),
                    layout: {
                        padding: {
                            left: 0,
                            right: 0,
                            top: 0,
                            bottom: 0
                        }
                    }
                }
            };

            var sData = checkIsStreaming();
            if(sData !== false){
                config.options.plugins["streaming"] = sData;
            }

            //add function tooltip
            var t_callpack = {
                label: UpdateTooltipLabel
            };
            config.options.plugins.tooltip.callbacks = t_callpack;

            console.log("CONFIG: ", JSON.stringify(config));

            return config;
        } catch (e) {
            alert(e);
        }
    }

    connect() {
        let location = window.detectLocation();
        var ws = new WebSocket(location['protocol'].replace(/^http/, 'ws') + "//" + location['host'] + "/hook/JSLive/WS/" + {INSTANCE});
        ws.onopen = function() {
            // subscribe to some channels
            //ws.send(JSON.stringify({
            //.... some message the I must send when I connect ....
            //}));
        };

        ws.onmessage = function(e) {
            data = JSON.parse(e.data);
            if(data.Message == 10506) {
                //refresh webseite
                setTimeout(function (){
                    window.location.reload(false);
                },1000);
            } else if(data.Message == 10603) {
                if(configuration.data_pullModeinMinute && configuration.Period === 7){
                    //ignore update date, wenn pullmode for minute active
                }else{
                    UpdateChart(data.SenderID, data.Data[3], data.Data[0]);
                }

                ReloadChart(data.SenderID, data.Data[3], data.Data[0]);
            }
        };

        ws.onclose = function(e) {
            console.log('Socket is closed. Reconnect will be attempted in 1 second.', e.reason);
            setTimeout(function() {
                connect();
            }, 1000);
        };

        ws.onerror = function(err) {
            console.error('Socket encountered error: ', err.message, 'Closing socket');
            ws.close();
        };
    }

    UpdateChart(id_val, dt_val, value){
        try{
            //wenn nicht Now dann kein Update durchführen!
            if(!configuration.Now || isReloading) return;

            var isUpdated = false;

            var required = {Variable: id_val};
            var results = [];
            results = getMatchingKeys(config_dataset, required);

            //console.log('Result:', results);
            //nur Updaten wenn ID in Chart exestiert
            if(results.length > 0){
                var period = configuration["Period"];
                //updaten des Aktuellen Charts
                results.forEach(function(part, index) {
                    //nur daten ohne Offset hier updaten

                    //check if BoolAxes
                    var isBool = false;
                    var yAxisID = myChart.data.datasets[part].yAxisID;
                    if(yAxisID in config_axes && "labels" in config_axes[yAxisID]){
                        var boolData = config_axes[yAxisID].labels;
                        if(value === 1){
                            val = boolData[0];
                        }else{
                            val = boolData[1];
                        }
                        isBool = true;
                    }


                    var offset = myChart.data.datasets[part].offset;
                    if(offset === 0) {
                        if(!isBool){
                            var precision = Math.pow(10, configuration.data_precision);

                            val = Math.floor(value * precision) /  precision;
                            var highRes = myChart.data.datasets[part].highRes;
                            var itemDate = UpdateDate(dt_val * 1000, highRes);
                        }

                        var counter = myChart.data.datasets[part].counter;
                        if(counter && !isBool){

                            val = val - myChart.data.datasets[part].lastValue;
                            val = Math.floor(val * precision) / precision;
                            if(val < 0) val = val * -1.0;

                            myChart.data.datasets[part].lastValue = Math.floor(value * 100000) / 100000;
                        }

                        if (highRes <= period) {
                            //highres Update

                            var last_index = (myChart.data.datasets[part].data.length - 1);

                            if(last_index >= 0){
                                var last_datencount = myChart.data.datasets[part].data[last_index].c

                                if(isNaN(last_datencount) || last_datencount >= configuration.data_highResSteps){
                                    //neuen Datensatz anlegen
                                    dataPoint = {
                                        x: itemDate.getTime(),
                                        y: val,
                                        c: 1
                                    }
                                    myChart.data.datasets[part].data.push(dataPoint);
                                }else{
                                    //alten datensatz ändern und c um 1 erhöhen
                                    myChart.data.datasets[part].data[last_index].y = val;
                                    myChart.data.datasets[part].data[last_index].c = last_datencount + 1;
                                }
                            }else{
                                //neuen Datensatz anlegen
                                var dataPoint = {
                                    x: itemDate.getTime(),
                                    y: val,
                                    c: 1
                                }
                                myChart.data.datasets[part].data.push(dataPoint);
                            }
                        } else {
                            //check Timestamp vorhanden
                            var required = {x: itemDate.getTime()};
                            var results = [];
                            results = getMatchingKeys(myChart.data.datasets[part].data, required);
                            //console.log('Result:', results);

                            if (results.length > 0) {
                                //ja alten updaten
                                if(counter && !isBool) {
                                    var old = myChart.data.datasets[part].data[results[0]].y;
                                    myChart.data.datasets[part].data[results[0]].y = old + val;
                                }else{
                                    c = 1;
                                    if (typeof myChart.data.datasets[part].data[results[0]].c != "undefined") {
                                        var oldval = myChart.data.datasets[part].data[results[0]].y;
                                        c = myChart.data.datasets[part].data[results[0]].c;

                                        if(!isBool) var val = Math.round(((oldval * c) + val) / (c + 1) * 100) / 100;
                                        c++;
                                    }

                                    myChart.data.datasets[part].data[results[0]].y = val;
                                    myChart.data.datasets[part].data[results[0]].c = c;
                                }
                            } else {
                                var dataPoint = {
                                    x: itemDate.getTime(),
                                    y: val,
                                    c: 1
                                }
                                myChart.data.datasets[part].data.push(dataPoint);
                            }

                        }
                    }
                });

                myChart.update({
                    preservation: true
                });
            }
        } catch (error) {
            console.error(error);
        }
    }
    ReloadChart(id_val, dt_val, val = null, fullReload = false){
        //deoppelten Reload verhinden!
        if(last_reload == dt_val) return;
        if(!update_vars.includes(id_val)) return;
        last_reload = dt_val;
        isReloading = true;

        if(configuration.ID_Period === id_val && val !== null){
            configuration.Period = val;
            fullReload = true;
        }
        if(configuration.ID_Relativ === id_val && val !== null){
            configuration.Relativ = val;
            fullReload = true;
        }

        if(configuration.data_loadAsync){
            config_dataset = [];
            config_xaxes = {};
            config_axes = {};

            //First Load Config!!
            $.getJSON("/hook/JSLive/getUpdate?Instance={INSTANCE}&pw={PASSWORD}&loadConfig=1", function( data ) {
                if(configuration.Period != data.Config.Period || configuration.Relativ != data.Config.Relativ){
                    fullReload = true;
                }
                configuration = data.Config;
                console.log("Configuration: ", JSON.stringify(data));

                //then load XAxes
                $.getJSON("/hook/JSLive/getUpdate?Instance={INSTANCE}&pw={PASSWORD}&loadAxes=1", function (data) {
                    //console.log("update Offset: ", data);
                    Object.assign(config_axes, data.AXES);
                    config_axes = data.AXES;
                    config_xaxes = data.XAXES;
                    console.log("AXES: ", JSON.stringify(data.AXES));
                    console.log("XAXES: ", JSON.stringify(data.XAXES));

                    //pullmod at Minute
                    if (config_global.DataMode !== 0 && configuration.data_pullModeinMinute && configuration.Period === 7 && !pullMode) {
                        //pullup Mode
                        var refreshRate = configuration.data_pullModeRefreshTime;
                        PullNewData(refreshRate);
                    }else if(config_global.DataMode !== 0){
                        pullModeStopping = true;
                    }

                    //load VariablesData Async
                    var first = true;
                    var counter_var = 0;
                    configuration.Var_List.forEach(function (Variable, index) {
                        $.getJSON("/hook/JSLive/getUpdate?Instance={INSTANCE}&pw={PASSWORD}&id=" + index, function (data) {
                            //console.log("update Offset: ", data);
                            if(data.DATASETS.length == 0){
                                console.log("Async Dataset " + Variable + " not Defined/Set!");
                                return;
                            }

                            //config_dataset.push(data.DATASETS[0]);
                            config_dataset[index] = data.DATASETS[0];
                            //Object.assign(config_axes, data.AXES);

                            console.log("Async Dataset " + Variable + " loaded");
                            console.log("Dataset: ", JSON.stringify(data));

                            if(first){
                                first = false
                                //fullReload = true;
                                if (fullReload || typeof myChart === "undefined") {
                                    console.log("RELOAD CHART Full!");
                                    if(typeof myChart !== "undefined") myChart.destroy();
                                    var ctx = document.getElementById('myChart');
                                    myChart = new Chart(ctx, updateChartconfig());


                                    last_update = Date.now();
                                    offset_isSet = checkOffsetisSet();
                                    UpdateConfiguration();
                                }else{
                                    myChart.data.datasets = config_dataset;
                                    myChart.update();
                                }

                            }else{
                                if(typeof myChart !== "undefined") {
                                    myChart.data.datasets = config_dataset;
                                    //myChart.options.scales = config_axes;

                                    console.log("Update Chart!");
                                    myChart.update();
                                }
                            }

                            isReloading = false;
                        });
                    });
                });
            });
        }else{
            //sync load of all Data
            $.getJSON( "/hook/JSLive/getUpdate?Instance={INSTANCE}&pw={PASSWORD}", function( data ) {
                if(configuration.Period != data.Config.Period || configuration.Relativ != data.Config.Relativ){
                    fullReload = true;
                }

                config_dataset = data.DATASETS;
                config_axes = data.AXES;
                config_xaxes =  data.XAXES;

                configuration = data.Config;

                //neuerstellen (aufgrund des livestreming plugins!
                if(fullReload){
                    console.log("RELOAD CHART Full!");
                    if(typeof myChart !== "undefined") myChart.destroy();
                    var ctx = document.getElementById('myChart');
                    myChart = new Chart(ctx, updateChartconfig());
                }else{
                    //sonst nur updaten 8D
                    myChart.data.datasets = config_dataset;
                    myChart.options.scales = Object.assign(config_axes, {x: config_xaxes});

                    console.log("RELOAD CHART!");
                    myChart.update();
                }
                last_update = Date.now();
                offset_isSet = checkOffsetisSet();
                UpdateConfiguration();

                isReloading = false;

                //pullmod at Minute
                if (config_global.DataMode !== 0 && configuration.data_pullModeinMinute && configuration.Period === 7 && !pullMode) {
                    var refreshRate = configuration.data_pullModeRefreshTime;
                    PullNewData(refreshRate);
                }else if(config_global.DataMode !== 0){
                    pullModeStopping = true;
                }
            });
        }
    }
    async UpdateConfiguration() {
        while (true){
            try {
                if(!configuration.Relativ) {
                    RefreshChart_Absolute();
                };

                if(configuration.Relativ && offset_isSet){
                    UpdateOffsetData_Relativ();
                }

                RemoveOldData()
            }catch (e) {
                console.log("UpdateOffsetData_Relativ => ", e);
            }
            await sleep(1000);
        }
    }

    UpdateDate(date, highRes = 7){
        var period = configuration["Period"];
        var oldDate = new Date(date);
        var newDate = new Date();

        if(highRes <= period){
            newDate = oldDate;
        }else{
            switch(period){
                case 0:
                    //dekade
                    newDate = new Date(oldDate.getFullYear(), 0, 1, 0, 0, 0);
                    break;
                case 1:
                    newDate = new Date(oldDate.getFullYear(), oldDate.getMonth(), 1, 0, 0, 0);
                    //Jahr
                    break;
                case 2:
                    newDate = new Date(oldDate.getFullYear(), oldDate.getMonth(), 1, 0, 0, 0);
                    //quartal
                    break;
                case 3:
                    newDate = new Date(oldDate.getFullYear(), oldDate.getMonth(), oldDate.getDate(), 0, 0, 0);
                    //Monat
                    break;
                case 4:
                    //woche
                    newDate = new Date(oldDate.getFullYear(), oldDate.getMonth(), oldDate.getDate(), 0, 0, 0);
                    break;
                case 5:
                    //tag
                    newDate = new Date(oldDate.getFullYear(), oldDate.getMonth(), oldDate.getDate(), oldDate.getHours(), 0, 0);
                    break;
                case 6:
                    //stunde
                    newDate = new Date(oldDate.getFullYear(), oldDate.getMonth(), oldDate.getDate(), oldDate.getHours(), oldDate.getMinutes(), 0);
                    break;
                case 7:
                    //minute
                    newDate = new Date(oldDate.getFullYear(), oldDate.getMonth(), oldDate.getDate(), oldDate.getHours(), oldDate.getMinutes(), oldDate.getSeconds());
                    break;
                default:
                    newDate = oldDate;
                    break;
            }
        }

        //console.log("oldDate:", oldDate);
        //console.log("newDate:", newDate);
        return newDate;
    }

    GetPeriodTimespan(){
        var period = configuration["Period"];

        switch(period){
            case 0:
                //dekade
                return 1000 * 60 * 60 * 24 * 7* 366; //3 max mögliche schaltjahre in dekade
            case 1:
                //Jahr
                return 1000 * 60 * 60 * 24 * 7 *31;
            case 2:
                //quartal
                return 1000 * 60 * 60 * 24 * 7* 31;
            case 3:
                //Monat
                return 1000 * 60 * 60 * 24; //vom längsten monat ausgehend
            case 4:
                //woche
                return 1000 * 60 * 60 * 24;
            case 5:
                //tag
                return 1000 * 60 * 60;
            case 6:
                //stunde
                return 1000 * 60;
            case 7:
                //minute
                return 5000;
            default: return -1;
        }

    }

    RemoveOldData() {
        if (myChart.options.scales.x.type != "realtime") {
            var itemDate = myChart.options.scales.x.min;

            //löschdatum holen
            myChart.data.datasets.forEach(function (part, index) {
                var rDate = GetRemoveDate(UpdateDate(itemDate, part.highRes));
                rDate = rDate.getTime() - GetPeriodTimespan(); //letzten 30 sekunden noch vorhalten

                //console.log("part" ,part);
                // in jeder chart älteres Daten löschen
                myChart.data.datasets[index].data.forEach(function (spart, sindex) {
                    //beginend von vorn
                    if (spart.x <= rDate) {
                        //löschen wenn älter
                        //console.log("lösche Index:", sindex);
                        myChart.data.datasets[index].data.splice(sindex, 1);
                    }
                });
            });
        }
    }
    UpdateOffsetData_Relativ() {
        if (configuration.Relativ) {
            var curDate = Date.now();

            myChart.data.datasets.forEach(function (part, index) {
                var offset = part.offset;
                c = part.data.length - 1;

                if (offset > 0 && c > 0) {

                    //mehr daten laden wenn Bar vorhanden
                    var start = Math.floor((part.data[c].x) / 1000);
                    var end = Math.floor((curDate) / 1000);

                    var highRes = part.highRes;
                    link = "/hook/JSLive/getData?Instance={INSTANCE}&pw={PASSWORD}&var=" + part.Variable + "&offset=" + offset + "&hires=" + highRes + "&start=" + start + "&end=" + end;
                    $.getJSON(link, function (data) {
                        //console.log("update Offset: ", data);

                        data[0].archiv.forEach(function (apart, aindex) {
                            var required = {x: apart.x};
                            var results = [];
                            results = getMatchingKeys(myChart.data.datasets[index].data, required);

                            if(results.length > 0){
                                myChart.data.datasets[index].data[results[0]] = apart;
                            }else{
                                myChart.data.datasets[index].data.push(apart);
                            }
                            myChart.update();
                        });
                    });
                }

            });
        }
    }
    RefreshChart_Absolute(curDate) {
        if (myChart.options.scales.x.type != "realtime") {
            curDate = Date.now();
            if(myChart.options.scales.x.max < curDate){
                var dateData = GetStartEndDate(curDate);
                myChart.options.scales.x.min = dateData.start;
                myChart.options.scales.x.max = dateData.end;
                myChart.update();

                UpdateOffsetData_Absolute();
            }
        }
    }

    async UpdateOffsetData_Absolute() {
        //absolute Mode
        //console.log("UpdateOffsetData_Absolute");
        var dateData = GetStartEndDate(Date.now());

        //mehr daten laden wenn Bar vorhanden
        var offsetTime = 0;
        if(configuration.Has_Bar){
            var offsetTime = GetPeriodTimespan();
        }

        var start = Math.floor(dateData.start / 1000) - offsetTime;
        var end = Math.floor(dateData.end / 1000) + offsetTime;

        myChart.data.datasets.forEach(function (part, index) {
            var offset = part.offset;
            c = part.data.length - 1;

            if (offset > 0 && c > 0) {

                var highRes = part.highRes;
                $.getJSON("/hook/JSLive/getData?Instance={INSTANCE}&pw={PASSWORD}&var=" + part.Variable + "&offset=" + offset + "&hires=" + highRes + "&start=" + start + "&end=" + end, function (data) {
                    //console.log("update Offset: ", data);

                    data[0].archiv.forEach(function (apart, aindex) {
                        myChart.data.datasets[index].data.push(apart);
                        var isUpdated = true;
                    });
                });
            }

        });

        myChart.update(0);
    }
    async PullNewData(refreshRate){
        pullMode = true;
        pullModeStopping = false;
        refreshRate = refreshRate * 1000;
        while (!pullModeStopping){
            try {
                var dt_val = Math.floor(Date.now() / 1000);
                $.getJSON("/hook/JSLive/getData?Instance={INSTANCE}&pw={PASSWORD}", function (data) {
                    data.forEach(function (part, index) {
                        UpdateChart(part.Variable, dt_val, part.Value);

                        if(update_vars.includes(part.Variable)) {
                            if(part.Variable in update_vars_Values){
                                //prüfen ob änderung und gegbfalls daten aktuallieseren
                                if(update_vars_Values[part.Variable] != part.Value){
                                    update_vars_Values[part.Variable] = part.Value;
                                    ReloadChart(part.Variable, dt_val);
                                }
                            }else{
                                update_vars_Values[part.Variable] = part.Value;
                            }
                        }
                    });
                });
            }catch (e) {
                console.log("PullNewData => ", e);
            }
            await sleep(refreshRate);
        }
    }

    GetStartEndDate(date) {
        var period = configuration.Period;
        var is_relativ = configuration.Relativ;
        var oldDate = new Date(date);

        var eDate = new Date();
        var sDate = new Date();

        if(is_relativ){
            eDate = oldDate;
            switch(period){
                case 0:
                    //dekade
                    sDate = new Date((oldDate.getFullYear()-10), oldDate.getMonth(), oldDate.getDate(), oldDate.getHours(), oldDate.getMinutes(), oldDate.getSeconds());
                    break;
                case 1:
                    //Jahr
                    sDate = new Date((oldDate.getFullYear()-1), oldDate.getMonth(), oldDate.getDate(), oldDate.getHours(), oldDate.getMinutes(), oldDate.getSeconds());
                    break;
                case 2:
                    //quartal
                    sDate = new Date(oldDate.getFullYear(), (oldDate.getMonth()-3), oldDate.getDate(), oldDate.getHours(), oldDate.getMinutes(), oldDate.getSeconds());
                    break;
                case 3:
                    //Monat
                    sDate = new Date(oldDate.getFullYear(), (oldDate.getMonth()-1), oldDate.getDate(), oldDate.getHours(), oldDate.getMinutes(), oldDate.getSeconds());
                    break;
                case 4:
                    //woche
                    //immer montag starten
                    sDate = new Date(oldDate.getFullYear(), oldDate.getMonth(), (oldDate.getDate()-7), oldDate.getHours(), oldDate.getMinutes(), oldDate.getSeconds());
                    break;
                case 5:
                    //tag
                    sDate = new Date(oldDate.getFullYear(), oldDate.getMonth(), (oldDate.getDate()-1), oldDate.getHours(), oldDate.getMinutes(), oldDate.getSeconds());
                    break;
                case 6:
                    //stunde
                    sDate = new Date(oldDate.getFullYear(), oldDate.getMonth(), oldDate.getDate(), (oldDate.getHours()-1), oldDate.getMinutes(), oldDate.getSeconds());
                    break;
                case 7:
                    //minute
                    sDate = new Date(oldDate.getFullYear(), oldDate.getMonth(), oldDate.getDate(), oldDate.getHours(), (oldDate.getMinutes()-1), oldDate.getSeconds());
                    break;
                default:
                    sDate = oldDate;
                    break;
            }
        }else{
            switch(period){
                case 0:
                    //dekade
                    var startyear = parseInt(oldDate.getFullYear() / 10) * 10;
                    sDate = new Date(startyear, 0, 0, 0, 0, 0);
                    eDate = new Date((startyear+10), 0, 0, 0, 0, 0);
                    break;
                case 1:
                    //Jahr
                    sDate = new Date(oldDate.getFullYear(), 0, 0, 0, 0, 0);
                    eDate = new Date((oldDate.getFullYear()+1), 0, 0, 0, 0, 0);
                    break;
                case 2:
                    //quartal
                    var starmonth = parseInt(oldDate.getMonth() / 3) * 3;
                    sDate = new Date(oldDate.getFullYear(), starmonth, 0, 0, 0, 0);
                    eDate = new Date(oldDate.getFullYear(), (starmonth+3), 0, 0, 0, 0);
                    break;
                case 3:
                    //Monat
                    sDate = new Date(oldDate.getFullYear(), oldDate.getMonth(), 0, 0, 0, 0);
                    eDate = new Date(oldDate.getFullYear(), (oldDate.getMonth()+1), 0, 0, 0, 0);
                    break;
                case 4:
                    //woche
                    //immer montag starten
                    var day = oldDate.getDay(),
                        diff = d.getDate() - day + (day == 0 ? -6:1); // adjust when day is sunday
                    oldDate = oldDate.setDate(diff);
                    sDate = new Date(oldDate.getFullYear(), oldDate.getMonth(), oldDate.getDate(), 0, 0, 0);
                    eDate = new Date(oldDate.getFullYear(), oldDate.getMonth(), (oldDate.getDate()+7), 0, 0, 0);
                    break;
                case 5:
                    //tag
                    sDate = new Date(oldDate.getFullYear(), oldDate.getMonth(), oldDate.getDate(), 0, 0, 0);
                    eDate = new Date(oldDate.getFullYear(), oldDate.getMonth(), (oldDate.getDate()+1), 0, 0, 0);
                    break;
                case 6:
                    //stunde
                    sDate = new Date(oldDate.getFullYear(), oldDate.getMonth(), oldDate.getDate(), oldDate.getHours(), 0, 0);
                    eDate = new Date(oldDate.getFullYear(), oldDate.getMonth(), oldDate.getDate(), (oldDate.getHours()+1), 0, 0);
                    break;
                case 7:
                    //minute
                    sDate = new Date(oldDate.getFullYear(), oldDate.getMonth(), oldDate.getDate(), oldDate.getHours(), oldDate.getMinutes(), 0);
                    eDate = new Date(oldDate.getFullYear(), oldDate.getMonth(), oldDate.getDate(), oldDate.getHours(), (oldDate.getMinutes()+1), 0);
                    break;
                default:
                    eDate = oldDate;
                    sDate = oldDate;
                    break;
            }
        }
        //console.log("sDate:", sDate);
        //console.log("eDate:", eDate);


        return { "start": sDate, "end": eDate};
    }
    GetRemoveDate(date){
        var period = configuration.Period;
        var is_relativ = configuration.Relativ;
        var oldDate = new Date(date);
        var rDate = new Date();

        //console.log("mode:", is_relativ);
        //console.log("oldDate:", oldDate);

        if(is_relativ){
            switch(period){
                case 0:
                    //dekade
                    rDate = new Date((oldDate.getFullYear()-10), 0, 1, 0, 0, 0);
                    break;
                case 1:
                    //Jahr
                    rDate = new Date((oldDate.getFullYear()-1), oldDate.getMonth(), 1, 0, 0, 0);
                    break;
                case 2:
                    //quartal
                    rDate = new Date(oldDate.getFullYear(), (oldDate.getMonth()-3), 1, 0, 0, 0);
                    break;
                case 3:
                    //Monat
                    rDate = new Date(oldDate.getFullYear(), (oldDate.getMonth()-1), oldDate.getDate(), 0, 0, 0);
                    break;
                case 4:
                    //woche
                    rDate = new Date(oldDate.getFullYear(), oldDate.getMonth(), (oldDate.getDate()-7), 0, 0, 0);
                    break;
                case 5:
                    //tag
                    rDate = new Date(oldDate.getFullYear(), oldDate.getMonth(), (oldDate.getDate()-1), oldDate.getHours(), 0, 0);
                    break;
                case 6:
                    //stunde
                    rDate = new Date(oldDate.getFullYear(), oldDate.getMonth(), oldDate.getDate(), (oldDate.getHours()-1), oldDate.getMinutes(), 0);
                    break;
                case 7:
                    //minute
                    rDate = new Date(oldDate.getFullYear(), oldDate.getMonth(), oldDate.getDate(), oldDate.getHours(), (oldDate.getMinutes()-1), oldDate.getSeconds());
                    break;
                default:
                    rDate = new Date(0);
                    break;
            }
        }else{
            switch(period){
                case 0:
                    //dekade
                    var startyear = parseInt(oldDate.getFullYear() / 10) * 10;
                    rDate = new Date(startyear, 0, 0, 0, 0, 0);
                    break;
                case 1:
                    //Jahr
                    rDate = new Date(oldDate.getFullYear(), 0, 0, 0, 0, 0);
                    break;
                case 2:
                    //quartal
                    var starmonth = parseInt(oldDate.getMonth() / 3) * 3;
                    rDate = new Date(oldDate.getFullYear(), starmonth, 0, 0, 0, 0);
                    break;
                case 3:
                    //Monat
                    rDate = new Date(oldDate.getFullYear(), oldDate.getMonth(), 0, 0, 0, 0);
                    break;
                case 4:
                    //woche
                    //immer montag starten
                    var day = oldDate.getDay(),
                        diff = d.getDate() - day + (day == 0 ? -6:1); // adjust when day is sunday
                    oldDate = oldDate.setDate(diff);
                    rDate = new Date(oldDate.getFullYear(), oldDate.getMonth(), oldDate.getDate(), 0, 0, 0);
                    break;
                case 5:
                    //tag
                    rDate = new Date(oldDate.getFullYear(), oldDate.getMonth(), oldDate.getDate(), 0, 0, 0);
                    break;
                case 6:
                    //stunde
                    rDate = new Date(oldDate.getFullYear(), oldDate.getMonth(), oldDate.getDate(), oldDate.getHours(), 0, 0);
                    break;
                case 7:
                    //minute
                    rDate = new Date(oldDate.getFullYear(), oldDate.getMonth(), oldDate.getDate(), oldDate.getHours(), oldDate.getMinutes(), 0);
                    break;
                default:
                    rDate = new Date(0);
                    break;
            }
        }

        //console.log("rDate:", rDate);
        return rDate;
    }
    checkIsStreaming(){
        //return false;
        if(configuration.Relativ == false) return false;
        switch(configuration.Period){
            case 0:
            case 1:
            case 2:
            case 3:
            case 4:
            case 5:
                return false;
            case 6:
            case 7:
                return {framerate: 30};
            default: return false;
        }

    }
    checkOffsetisSet(){
        var isSet = false
        myChart.data.datasets.forEach(function(part, index) {
            var offset = part.offset;

            if(offset > 0) isSet = true;
        });

        return isSet;
    }
    UpdateTooltipLabel(context){
        var dataset = context.dataset;

        var Suffix = "";
        var Prefix = "";
        var blocks = [];


        key = dataset.yAxisID;
        if(key in config_axes){
            Suffix = config_axes[key].Suffix;
            Prefix = config_axes[key].Prefix;
        };

        if (dataset.label) {
            blocks.push(dataset.label + ': ');
        }
        if (Prefix !== "") {
            blocks.push(Prefix);
        }

        var precision = Math.pow(10, configuration.data_precision);
        var str  = Math.floor(context.parsed.y * precision) / precision;
        blocks.push(str)
        if (Suffix !== "") {
            blocks.push(Suffix);
        }
        return blocks.join('');
    }

    bootUp(){
        try {
            //load config after Startup
            var dt_val = Math.floor(Date.now() / 1000);
            ReloadChart(update_vars[0], dt_val, null, true);

            if (config_global.DataMode === 0) {
                //pullup Mode
                var refreshRate = config_global.RefreshTime;
                PullNewData(refreshRate);
            } else {
                connect();
            }
        }catch (e) {
            alert("Chart | ", e.message);
        }
    }
}

