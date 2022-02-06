class ClassName {
    constructor(config_global, config_dataEvents, config_views, configuration) {
        this.config_global = config_global;
        this.config_dataEvents = config_dataEvents;
        this.config_views = config_views;
        this.configuration = configuration;

        this.running = false;
        this.last_update = Date.now();

        window.addEventListener("load", onload, true);
    }

    Load(){
        try {
            var calendarEl = document.getElementById('calendar');
            var calendar = new FullCalendar.Calendar(calendarEl, {
                initialView: configuration.initialView,
                height: (Get_WindowHeight()-20),
                eventSources: CreateEventSource(),
                titleFormat: configuration.titleFormat,
                headerToolbar: configuration.header,
                footerToolbar: configuration.footer,
                weekNumbers: configuration.table_weekNumbers_display,
                weekNumberFormat: { week: configuration.table_weekNumberFormat },
                views: config_views,
                locale: 'de'
            });

            if(configuration.table_weekText_display){
                //calendar.setOption('locale', 'fr');
            }
            calendar.render();
        }catch (e) {
            alert(e);
        }
    }
    CreateEventSource(){
        let location = window.detectLocation();

        config_dataEvents.forEach((element, index) => {
            if(config_dataEvents[index]["Type"] === "module"){
                config_dataEvents[index]["url"] = location['protocol'] + "//" + location['host'] + "/hook/JSLive/getFeed";
                config_dataEvents[index]["extraParams"]["pw"] = config_global.Password;

            }else if(config_dataEvents[index]["Type"] === "file"){
                //location['protocol'] + "//" + location['host'] +
                config_dataEvents[index]["url"] = "/hook/JSLive/getICS?Instance="+configuration.InstanceID+"&pw="+config_global.Password+"&md5="+config_dataEvents[index]["md5"];
            }else if(config_dataEvents[index]["Type"] === "link"){
                config_dataEvents[index]["url"] = "/hook/JSLive/getICS?Instance="+configuration.InstanceID+"&pw="+config_global.Password+"&md5="+config_dataEvents[index]["md5"];
            }

            config_dataEvents[index]["failure"] = function () {
                $('#script-warning').show();
                alert('there was an error while fetching events!');
            }
        });

        return config_dataEvents;
    }

    updateValue(e) {
        value = this.value;
        if(!running) this.UpdateWorker();
    }

    async UpdateWorker(){
        this.running = true;
        last_update = Date.now();
        while (running){
            await sleep(1);
            try {
                if((last_update + configuration.DataUpdateRate) <= Date.now()){
                    last_update = Date.now();

                    console.log(Date.now() + " >> UpdateWorker | Update => " + value);
                    var response = await fetch("/hook/JSLive/setData?Instance={INSTANCE}&pw={PASSWORD}&val="+value);
                    console.log(Date.now() + " >> UpdateWorker Response => " + response.statusText + " (" + response.status + ")");

                    console.log(Date.now() + " >> UpdateWorker => CLOSE");
                    running = false;
                }
            }catch (e) {
                console.log(Date.now() + " >> UpdateWorker => ", e);
            }
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
                Update(data.SenderID, data.Data[0]);
            }
        };

        ws.onclose = function(e) {
            console.log(Date.now() + ' >> Socket is closed. Reconnect will be attempted in 1 second.', e.reason);
            setTimeout(function() {
                connect();
            }, 1000);
        };

        ws.onerror = function(err) {
            console.error(Date.now() + ' >> Socket encountered error: ', err.message, 'Closing socket');
            ws.close();
        };
    }

    Update(id_val, val){
        if(this.running) return;

        if(id_val === configuration.Variable && value !== val){
            value = val;

            var obj = document.querySelector("#text");
            obj.value = value;
        }
    }

    async PullNewData(refreshRate){
        refreshRate = refreshRate * 1000;
        while (true){
            try {
                $.getJSON("/hook/JSLive/getData?Instance={INSTANCE}&pw={PASSWORD}", function (data) {
                    Update(data.Variable, data.Value);
                });

                //Control Variables
            }catch (e) {
                console.log(Date.now() + " >> PullNewData => ", e);
            }
            await sleep(refreshRate);
        }
    }
    onload(){
        try {
            Load();

            if (config_global.LocalAddress == "" && config_global.LocalDataMode == 0) {
                //pullup Mode local
                PullNewData(config_global.LocalRefreshTime);
            } else if (config_global.RemoteAddress == "" && config_global.RemoteDataMode == 0) {
                //pullup Mode remote
                PullNewData(config_global.RefreshTime);
            } else {
                connect();
            }
        }catch (e) {
            alert(e);
        }
    }


}