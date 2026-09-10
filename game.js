(function () {
  "use strict";

  var W = 58, H = 16, D = 58, AIR = 0;
  var BLOCK = {
    GRASS: 1, DIRT: 2, SAND: 3, ROCK: 4, SNOW: 5, ICE: 6, WATER: 7,
    TRUNK: 8, BIRCH: 9, LEAVES: 10, PINE: 11, DARK_PINE: 12, PALM: 13,
    PALM_LEAVES: 14, BUSH: 15, SURFACE_ROCK: 16, MOSS: 17, CRACKED: 18,
    CRYSTAL: 19, SULFUR: 20, MUSHROOM_STEM: 21, MUSHROOM_RED: 22,
    MUSHROOM_SPOTTED: 23, FLOWER_RED: 24, FLOWER_YELLOW: 25,
    FLOWER_PURPLE: 26, WALL: 27, ROOF: 28, DOOR: 29, WINDOW: 30
  };
  var BLOCK_NAMES = {
    1: "Grass", 2: "Dirt", 3: "Sand", 4: "Rock", 5: "Snow",
    8: "Timber", 10: "Leaves", 17: "Moss stone", 18: "Cracked stone",
    19: "Rune crystal", 20: "Sulfur", 27: "Wall", 28: "Roof"
  };
  var HOTBAR = [BLOCK.GRASS, BLOCK.DIRT, BLOCK.ROCK, BLOCK.TRUNK, BLOCK.LEAVES, BLOCK.SAND, BLOCK.SNOW, BLOCK.MOSS, BLOCK.WALL];
  var FACE_DEFS = [
    { n:[ 1, 0, 0], c:[[1,0,0],[1,1,0],[1,1,1],[1,0,1]], shade:.82 },
    { n:[-1, 0, 0], c:[[0,0,1],[0,1,1],[0,1,0],[0,0,0]], shade:.68 },
    { n:[ 0, 1, 0], c:[[0,1,0],[0,1,1],[1,1,1],[1,1,0]], shade:1 },
    { n:[ 0,-1, 0], c:[[0,0,1],[0,0,0],[1,0,0],[1,0,1]], shade:.48 },
    { n:[ 0, 0, 1], c:[[1,0,1],[1,1,1],[0,1,1],[0,0,1]], shade:.9 },
    { n:[ 0, 0,-1], c:[[0,0,0],[0,1,0],[1,1,0],[1,0,0]], shade:.73 }
  ];
  var FACTIONS = {
    forest:   { name:"Forestkin", color:0x4fae5c, accent:0xb9e36c, speed:1.17, damage:1, hp:1, income:1.25, crest:"♣" },
    mountain: { name:"Mountainfolk", color:0x5584b4, accent:0xc8d9e8, speed:.88, damage:1, hp:1.4, income:1, crest:"◆" },
    sulfur:   { name:"Sulfurborn", color:0xd66b36, accent:0xffd15b, speed:1, damage:1.32, hp:.9, income:1.08, crest:"✦" }
  };
  var BUILD_COST = {
    farm:{wood:25,stone:0}, barracks:{wood:35,stone:20}, tower:{wood:0,stone:45}
  };

  var scene, camera, renderer, controls, terrainMesh, ocean, player, hoverGhost;
  var world = new Uint8Array(W * H * D);
  var mode = "menu", paused = false, selectedBlock = BLOCK.GRASS, selectedBuild = null;
  var playerFaction = "forest", keys = Object.create(null), pointer = {x:0,y:0,down:null,drag:false};
  var playerState = {x:29,y:8,z:29,vx:0,vy:0,vz:0,grounded:false,coyote:0,jumpBuffer:0};
  var worldDirty = false, last = performance.now(), gameTime = 0, strategyAccumulator = 0;
  var menuAngle = .72, toastTimer = 0, mobileMove = {x:0,y:0};
  var buildings = [], bases = [], units = [], capturePoints = [], unitRenderers = {};
  var resources = {wood:90,stone:70,crystal:0}, rally = null, matchOver = false;
  var raycaster = new THREE.Raycaster(), mouse = new THREE.Vector2();
  var atlasInfo;

  function idx(x,y,z){ return x + W * (z + D * y); }
  function inside(x,y,z){ return x>=0 && x<W && z>=0 && z<D && y>=0 && y<H; }
  function get(x,y,z){ return inside(x,y,z) ? world[idx(x,y,z)] : AIR; }
  function set(x,y,z,b){ if(inside(x,y,z)) world[idx(x,y,z)] = b; }
  function solid(b){
    return b!==AIR && b!==BLOCK.WATER && b!==BLOCK.LEAVES && b!==BLOCK.PINE &&
      b!==BLOCK.DARK_PINE && b!==BLOCK.PALM_LEAVES && b!==BLOCK.BUSH &&
      b!==BLOCK.CRYSTAL && b!==BLOCK.MUSHROOM_STEM && b!==BLOCK.MUSHROOM_RED &&
      b!==BLOCK.MUSHROOM_SPOTTED && b!==BLOCK.FLOWER_RED &&
      b!==BLOCK.FLOWER_YELLOW && b!==BLOCK.FLOWER_PURPLE;
  }
  function topAt(x,z){
    x=Math.floor(x); z=Math.floor(z);
    if(x<0||x>=W||z<0||z>=D) return -1;
    for(var y=H-1;y>=0;y--) if(solid(get(x,y,z))) return y;
    return -1;
  }
  function hash(x,z,s){ var n=Math.sin(x*127.1+z*311.7+s*74.7)*43758.5453; return n-Math.floor(n); }

  function rgbaFromHex(hex, at){
    return [parseInt(hex.slice(at,at+2),16),parseInt(hex.slice(at+2,at+4),16),parseInt(hex.slice(at+4,at+6),16),parseInt(hex.slice(at+6,at+8),16)];
  }
  function buildAtlas(){
    var tile=16, cols=16, rows=Math.ceil(180/cols);
    var canvas=document.createElement("canvas"); canvas.width=cols*tile; canvas.height=rows*tile;
    var ctx=canvas.getContext("2d"); ctx.imageSmoothingEnabled=false;
    for(var s=0;s<180;s++){
      var packed=window.VOXV2_PX4.faces[s], ox=(s%cols)*tile, oy=Math.floor(s/cols)*tile;
      for(var py=0;py<4;py++) for(var px=0;px<4;px++){
        var c=rgbaFromHex(packed,(py*4+px)*8);
        ctx.fillStyle="rgba("+c[0]+","+c[1]+","+c[2]+","+(c[3]/255)+")";
        ctx.fillRect(ox+px*4,oy+py*4,4,4);
      }
    }
    var texture=new THREE.CanvasTexture(canvas);
    texture.magFilter=THREE.NearestFilter; texture.minFilter=THREE.NearestMipMapNearestFilter;
    texture.generateMipmaps=true; texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;
    if("encoding" in texture) texture.encoding=THREE.sRGBEncoding;
    return {canvas:canvas,texture:texture,cols:cols,rows:rows,tile:tile};
  }
  function sliceFor(block,face){ return (block-1)*6+face; }
  function faceUV(slice){
    var col=slice%atlasInfo.cols,row=Math.floor(slice/atlasInfo.cols),e=.001;
    var u0=col/atlasInfo.cols+e,u1=(col+1)/atlasInfo.cols-e;
    var v1=1-row/atlasInfo.rows-e,v0=1-(row+1)/atlasInfo.rows+e;
    return [[u0,v0],[u0,v1],[u1,v1],[u1,v0]];
  }

  function buildTerrainMesh(){
    var pos=[],norm=[],uv=[],color=[],index=[],vi=0;
    for(var y=0;y<H;y++) for(var z=0;z<D;z++) for(var x=0;x<W;x++){
      var b=get(x,y,z); if(b===AIR||b===BLOCK.WATER) continue;
      for(var f=0;f<6;f++){
        var def=FACE_DEFS[f], nx=x+def.n[0],ny=y+def.n[1],nz=z+def.n[2],other=get(nx,ny,nz);
        if(other!==AIR && other!==BLOCK.WATER && !(b!==BLOCK.LEAVES && !solid(other))) continue;
        var tuv=faceUV(sliceFor(b,f));
        for(var q=0;q<4;q++){
          var c=def.c[q]; pos.push(x+c[0],y+c[1],z+c[2]);
          norm.push(def.n[0],def.n[1],def.n[2]); uv.push(tuv[q][0],tuv[q][1]);
          color.push(def.shade,def.shade,def.shade);
        }
        index.push(vi,vi+1,vi+2,vi,vi+2,vi+3); vi+=4;
      }
    }
    var g=new THREE.BufferGeometry();
    g.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));
    g.setAttribute("normal",new THREE.Float32BufferAttribute(norm,3));
    g.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));
    g.setAttribute("color",new THREE.Float32BufferAttribute(color,3));
    g.setIndex(index); g.computeBoundingSphere();
    var mat=new THREE.MeshLambertMaterial({map:atlasInfo.texture,vertexColors:true,alphaTest:.12});
    var mesh=new THREE.Mesh(g,mat); mesh.receiveShadow=true;
    if(terrainMesh){ scene.remove(terrainMesh); terrainMesh.geometry.dispose(); terrainMesh.material.dispose(); }
    terrainMesh=mesh; scene.add(mesh); worldDirty=false;
  }

  function clearWorld(){ world.fill(0); }
  function island(cx,cz,rx,rz,base,peak,biome,seed){
    for(var x=Math.max(1,Math.floor(cx-rx-2));x<Math.min(W-1,Math.ceil(cx+rx+2));x++) for(var z=Math.max(1,Math.floor(cz-rz-2));z<Math.min(D-1,Math.ceil(cz+rz+2));z++){
      var dx=(x-cx)/rx,dz=(z-cz)/rz,dist=Math.sqrt(dx*dx+dz*dz);
      var wobble=(hash(x,z,seed)-.5)*.2 + Math.sin(x*.8+seed)*.035 + Math.cos(z*.7-seed)*.035;
      if(dist+wobble>1) continue;
      var dome=Math.pow(Math.max(0,1-dist),.62), top=Math.floor(base+dome*peak+(hash(x,z,seed+9)-.5)*1.2);
      var bottom=Math.max(0,Math.floor(1-(1-dist)*2));
      for(var y=bottom;y<=top;y++){
        var b=BLOCK.ROCK;
        if(y===top) b=biome==="sand"?BLOCK.SAND:biome==="snow"?BLOCK.SNOW:BLOCK.GRASS;
        else if(y>=top-2) b=biome==="sand"?BLOCK.SAND:BLOCK.DIRT;
        set(x,y,z,b);
      }
    }
  }
  function bridge(ax,az,bx,bz,width,material){
    var steps=Math.ceil(Math.hypot(bx-ax,bz-az)*2);
    for(var i=0;i<=steps;i++){
      var t=i/steps,x=Math.round(ax+(bx-ax)*t),z=Math.round(az+(bz-az)*t);
      for(var ox=-width;ox<=width;ox++) for(var oz=-width;oz<=width;oz++) if(Math.abs(ox)+Math.abs(oz)<=width+1){
        var top=topAt(x+ox,z+oz), y=top>=0?Math.max(4,top):4;
        set(x+ox,y,z+oz,material||BLOCK.MOSS);
        if(get(x+ox,y-1,z+oz)===AIR) set(x+ox,y-1,z+oz,BLOCK.ROCK);
      }
    }
  }
  function tree(x,z,type){
    var y=topAt(x,z); if(y<2||get(x,y,z)===BLOCK.SAND) return;
    var trunk=type==="pine"?BLOCK.BIRCH:BLOCK.TRUNK, leaf=type==="pine"?BLOCK.PINE:BLOCK.LEAVES;
    var ht=3+(hash(x,z,31)>.6?1:0);
    for(var i=1;i<=ht;i++) set(x,y+i,z,trunk);
    for(var dy=ht-1;dy<=ht+1;dy++) for(var dx=-1;dx<=1;dx++) for(var dz=-1;dz<=1;dz++){
      if(Math.abs(dx)+Math.abs(dz)+(dy===ht+1?1:0)>2) continue;
      if(get(x+dx,y+dy,z+dz)===AIR) set(x+dx,y+dy,z+dz,leaf);
    }
  }
  function decorate(seed,density){
    for(var x=2;x<W-2;x++) for(var z=2;z<D-2;z++){
      var y=topAt(x,z), b=get(x,y,z), r=hash(x,z,seed);
      if(y<3) continue;
      if((b===BLOCK.GRASS||b===BLOCK.SNOW) && r<density && topAt(x+1,z)===y) tree(x,z,b===BLOCK.SNOW?"pine":"oak");
      else if(b===BLOCK.GRASS && r>.985) set(x,y+1,z,[BLOCK.FLOWER_RED,BLOCK.FLOWER_YELLOW,BLOCK.FLOWER_PURPLE][Math.floor(hash(x,z,44)*3)]);
      else if((b===BLOCK.GRASS||b===BLOCK.ROCK)&&r>.972&&r<.985) set(x,y+1,z,BLOCK.SURFACE_ROCK);
    }
  }
  function generateSandbox(){
    clearWorld();
    island(29,29,13,11,4,5,"grass",1); island(10,13,7,6,4,4,"snow",2);
    island(47,13,7,6,3,4,"sand",3); island(12,47,6,6,3,4,"grass",4);
    island(47,45,7,7,4,5,"grass",5); island(31,8,5,4,3,3,"grass",6);
    decorate(17,.035);
  }
  function generateStrategy(){
    clearWorld();
    island(12,43,11,10,4,5,"grass",11);
    island(46,43,11,10,4,6,"snow",12);
    island(29,11,12,10,4,5,"sand",13);
    island(29,31,10,9,3,4,"grass",14);
    island(16,25,6,5,3,3,"grass",15); island(43,25,6,5,3,3,"snow",16);
    bridge(15,39,25,33,1,BLOCK.MOSS); bridge(43,39,34,33,1,BLOCK.CRACKED); bridge(29,18,29,26,1,BLOCK.SAND);
    decorate(88,.025);
    [[29,31],[16,25],[43,25]].forEach(function(p){ var y=topAt(p[0],p[1]); set(p[0],y+1,p[1],BLOCK.CRYSTAL); });
  }

  function box(w,h,d,color){
    var m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshLambertMaterial({color:color}));
    m.castShadow=true; m.receiveShadow=true; return m;
  }
  function createPlayer(){
    if(player) scene.remove(player);
    player=new THREE.Group();
    var skin=box(.48,.46,.48,0xf2c596); skin.position.y=1.48;
    var body=box(.58,.62,.32,0x315f8e); body.position.y=.92;
    var leg1=box(.2,.58,.22,0x243956),leg2=leg1.clone(); leg1.position.set(-.15,.31,0);leg2.position.set(.15,.31,0);
    var arm1=box(.16,.56,.18,0xf2c596),arm2=arm1.clone();arm1.position.set(-.38,.92,0);arm2.position.set(.38,.92,0);
    player.add(skin,body,leg1,leg2,arm1,arm2); player.userData={legs:[leg1,leg2],arms:[arm1,arm2],walk:0};
    scene.add(player);
  }
  function resetPlayer(x,z){
    playerState.x=x;playerState.z=z;playerState.y=topAt(x,z)+1.01;playerState.vx=playerState.vy=playerState.vz=0;
    player.position.set(playerState.x+.5,playerState.y,playerState.z+.5); player.visible=mode!=="menu";
  }

  function structure(kind,faction,x,z){
    var f=FACTIONS[faction],g=new THREE.Group(), y=topAt(x,z)+1;
    g.position.set(x+.5,y,z+.5); g.userData={kind:kind,faction:faction};
    if(kind==="hq"){
      var base=box(4,1,4,0x5a4a3c);base.position.y=.5;
      var keep=box(2.4,3,2.4,f.color);keep.position.y=2;
      var roof=box(2.8,.45,2.8,f.accent);roof.position.y=3.7;
      var flag=box(.18,2,.18,0x4a3828);flag.position.set(0,4.7,0);
      var banner=box(1.2,.8,.12,f.accent);banner.position.set(.65,5.2,0);
      g.add(base,keep,roof,flag,banner);
    } else if(kind==="barracks"){
      var b=box(2.7,1.7,2.7,f.color);b.position.y=.85;
      var r=box(3.1,.55,3.1,f.accent);r.position.y=1.9;g.add(b,r);
    } else if(kind==="tower"){
      var t=box(1.45,3.4,1.45,0x6e7378);t.position.y=1.7;
      var cap=box(2, .55,2,f.accent);cap.position.y=3.5;g.add(t,cap);
    } else {
      var soil=box(3,.25,3,0x6e4b2f);soil.position.y=.12;g.add(soil);
      for(var i=0;i<4;i++){var sap=box(.22,.8,.22,0x4b7839);sap.position.set(-.9+i*.6,.55,0);g.add(sap);}
    }
    scene.add(g); return g;
  }
  function clearStrategy(){
    buildings.forEach(function(b){scene.remove(b.mesh);}); bases.forEach(function(b){scene.remove(b.mesh);});
    capturePoints.forEach(function(c){scene.remove(c.mesh);});
    buildings=[];bases=[];units=[];capturePoints=[];rally=null;matchOver=false;
    Object.keys(unitRenderers).forEach(function(k){var r=unitRenderers[k];scene.remove(r.body);scene.remove(r.head);r.body.geometry.dispose();r.head.geometry.dispose();r.body.material.dispose();r.head.material.dispose();});
    unitRenderers={};
  }
  function initStrategy(chosen){
    clearStrategy(); playerFaction=chosen; resources={wood:90,stone:70,crystal:0};
    var spots={forest:[12,43],mountain:[46,43],sulfur:[29,11]};
    Object.keys(FACTIONS).forEach(function(faction){
      var p=spots[faction], mesh=structure("hq",faction,p[0],p[1]);
      bases.push({faction:faction,x:p[0],z:p[1],hp:Math.round(450*FACTIONS[faction].hp),maxHp:Math.round(450*FACTIONS[faction].hp),mesh:mesh});
      var bx=p[0]+(faction==="forest"?4:faction==="mountain"?-4:4),bz=p[1]+(faction==="sulfur"?4:-1);
      buildings.push({kind:"barracks",faction:faction,x:bx,z:bz,mesh:structure("barracks",faction,bx,bz),timer:2+hash(bx,bz,9)*3});
      var tx=p[0]+(faction==="forest"?-4:faction==="mountain"?4:-4),tz=p[1]+(faction==="sulfur"?3:1);
      buildings.push({kind:"tower",faction:faction,x:tx,z:tz,mesh:structure("tower",faction,tx,tz),timer:0});
      for(var i=0;i<5;i++) spawnUnit(faction,p[0]+(i%3)-1,p[1]+Math.floor(i/3)+2);
    });
    [[29,31],[16,25],[43,25]].forEach(function(p,i){
      var ring=new THREE.Mesh(new THREE.TorusGeometry(1.15,.12,6,18),new THREE.MeshBasicMaterial({color:0xf2dc92}));
      ring.rotation.x=Math.PI/2; ring.position.set(p[0]+.5,topAt(p[0],p[1])+1.12,p[1]+.5);scene.add(ring);
      capturePoints.push({x:p[0],z:p[1],owner:null,claim:null,progress:0,mesh:ring,index:i});
    });
    initUnitRenderers();
    var sp=spots[chosen]; resetPlayer(sp[0]+2,sp[1]+2); updateResources();
  }
  function initUnitRenderers(){
    Object.keys(FACTIONS).forEach(function(f){
      var geoBody=new THREE.BoxGeometry(.55,.72,.42),geoHead=new THREE.BoxGeometry(.42,.42,.42);
      var body=new THREE.InstancedMesh(geoBody,new THREE.MeshLambertMaterial({color:FACTIONS[f].color}),256);
      var head=new THREE.InstancedMesh(geoHead,new THREE.MeshLambertMaterial({color:0xf0c18d}),256);
      body.instanceMatrix.setUsage(THREE.DynamicDrawUsage);head.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      body.castShadow=head.castShadow=true;scene.add(body);scene.add(head);unitRenderers[f]={body:body,head:head};
    });
  }
  function spawnUnit(faction,x,z){
    if(units.filter(function(u){return u.faction===faction;}).length>=72)return;
    units.push({faction:faction,x:x+.5,z:z+.5,y:topAt(x,z)+1,hp:Math.round(38*FACTIONS[faction].hp),cooldown:0,phase:hash(x,z,units.length)*6.28});
  }
  function nearestEnemyBase(faction,x,z){
    var best=null,bd=1e9;bases.forEach(function(b){if(b.faction===faction||b.hp<=0)return;var d=Math.hypot(b.x-x,b.z-z);if(d<bd){bd=d;best=b;}});return best;
  }
  function strategyTick(dt){
    if(matchOver)return;
    gameTime+=dt;
    if(playerFaction){
      var inc=FACTIONS[playerFaction].income;
      resources.wood+=dt*(1.6+buildings.filter(function(b){return b.faction===playerFaction&&b.kind==="farm";}).length*1.4)*inc;
      resources.stone+=dt*.85*inc;resources.crystal+=dt*.06;
    }
    buildings.forEach(function(b){
      b.timer-=dt;
      if(b.kind==="barracks"&&b.timer<=0){spawnUnit(b.faction,b.x,b.z+2);b.timer=4.8/FACTIONS[b.faction].speed;}
      if(b.kind==="tower"&&b.timer<=0){
        var target=null,dist=7.5;
        units.forEach(function(u){if(u.faction===b.faction||u.hp<=0)return;var d=Math.hypot(u.x-b.x,u.z-b.z);if(d<dist){dist=d;target=u;}});
        if(target){target.hp-=12*FACTIONS[b.faction].damage;b.timer=.8;}
      }
    });
    for(var i=0;i<units.length;i++){
      var u=units[i];if(u.hp<=0)continue;u.cooldown-=dt;
      var enemy=null,ed=2.1;
      for(var j=0;j<units.length;j++){var v=units[j];if(v.hp<=0||v.faction===u.faction)continue;var du=Math.hypot(v.x-u.x,v.z-u.z);if(du<ed){ed=du;enemy=v;}}
      if(enemy){
        if(ed<1.15&&u.cooldown<=0){enemy.hp-=6*FACTIONS[u.faction].damage;u.cooldown=.65;}
        else moveUnit(u,enemy.x,enemy.z,dt*.6);
      } else {
        var base=nearestEnemyBase(u.faction,u.x,u.z);if(!base)continue;
        var tx=base.x+.5,tz=base.z+.5;
        // Every home island has a land bridge into the central island. March there
        // before choosing the final stronghold so armies do not try to cross the sea.
        if(Math.hypot(u.x-29.5,u.z-31.5)>6.5){tx=29.5;tz=31.5;}
        if(u.faction===playerFaction&&rally&&Math.hypot(u.x-rally.x,u.z-rally.z)>1.5){tx=rally.x;tz=rally.z;}
        var db=Math.hypot(u.x-(base.x+.5),u.z-(base.z+.5));
        if(db<2.6&&u.cooldown<=0){base.hp-=4.5*FACTIONS[u.faction].damage;u.cooldown=.7;base.mesh.scale.y=.96;setTimeout(function(){},0);}
        else moveUnit(u,tx,tz,dt);
      }
    }
    units=units.filter(function(u){return u.hp>0;});
    capturePoints.forEach(function(c){
      var counts={forest:0,mountain:0,sulfur:0};
      units.forEach(function(u){if(Math.hypot(u.x-c.x-.5,u.z-c.z-.5)<3.4)counts[u.faction]++;});
      var lead=null,max=0,tie=false;Object.keys(counts).forEach(function(f){if(counts[f]>max){lead=f;max=counts[f];tie=false;}else if(counts[f]===max&&max>0)tie=true;});
      if(!tie&&lead&&lead!==c.owner){if(c.claim!==lead){c.claim=lead;c.progress=0;}c.progress+=dt;if(c.progress>3){c.owner=lead;c.progress=0;c.mesh.material.color.setHex(FACTIONS[lead].accent);}}
      c.mesh.rotation.z+=dt*.5;
    });
    bases.forEach(function(b){b.mesh.scale.y+=(1-b.mesh.scale.y)*.18;if(b.hp<=0&&b.mesh.visible){b.mesh.visible=false;showToast(FACTIONS[b.faction].name+" stronghold has fallen!");}});
    var alive=bases.filter(function(b){return b.hp>0;});if(alive.length===1){matchOver=true;showToast(FACTIONS[alive[0].faction].name+" rule the isles!");}
    updateResources();
  }
  function moveUnit(u,tx,tz,dt){
    var dx=tx-u.x,dz=tz-u.z,l=Math.hypot(dx,dz)||1,s=1.45*FACTIONS[u.faction].speed;
    var nx=u.x+dx/l*s*dt,nz=u.z+dz/l*s*dt,top=topAt(nx,nz);
    if(top>=2){u.x=nx;u.z=nz;u.y=top+1;}
  }
  function renderUnits(now){
    if(mode!=="strategy")return;
    var dummy=new THREE.Object3D();
    Object.keys(FACTIONS).forEach(function(f){
      var list=units.filter(function(u){return u.faction===f&&u.hp>0;}).slice(0,256),r=unitRenderers[f];if(!r)return;
      for(var i=0;i<list.length;i++){
        var u=list[i],bob=Math.abs(Math.sin(now*.006+u.phase))*.08;
        dummy.position.set(u.x,u.y+.38+bob,u.z);dummy.rotation.y=Math.atan2(Math.sin(now*.001+u.phase),Math.cos(now*.001+u.phase));dummy.updateMatrix();r.body.setMatrixAt(i,dummy.matrix);
        dummy.position.y=u.y+.96+bob;dummy.updateMatrix();r.head.setMatrixAt(i,dummy.matrix);
      }
      r.body.count=r.head.count=list.length;r.body.instanceMatrix.needsUpdate=r.head.instanceMatrix.needsUpdate=true;
    });
  }

  function buildHotbar(){
    var bar=document.getElementById("sandboxHud");bar.innerHTML="";
    HOTBAR.forEach(function(b,i){
      var el=document.createElement("button");el.className="slot"+(b===selectedBlock?" selected":"");el.title=BLOCK_NAMES[b];
      var cv=document.createElement("canvas");cv.width=cv.height=32;var ctx=cv.getContext("2d");ctx.imageSmoothingEnabled=false;
      var slice=sliceFor(b,2),sx=(slice%atlasInfo.cols)*16,sy=Math.floor(slice/atlasInfo.cols)*16;
      ctx.drawImage(atlasInfo.canvas,sx,sy,16,16,0,0,32,32);el.appendChild(cv);
      var num=document.createElement("em");num.textContent=i+1;el.appendChild(num);
      el.addEventListener("click",function(){selectBlock(b);});bar.appendChild(el);
    });
  }
  function selectBlock(b){selectedBlock=b;document.querySelectorAll(".slot").forEach(function(e,i){e.classList.toggle("selected",HOTBAR[i]===b);});showToast(BLOCK_NAMES[b]);}
  function updateResources(){
    var hud=document.getElementById("resourceHud"),base=bases.find(function(b){return b.faction===playerFaction;});
    hud.innerHTML='<span class="resource"><i>♣</i>'+Math.floor(resources.wood)+'</span><span class="resource"><i>◆</i>'+Math.floor(resources.stone)+'</span><span class="resource"><i>✦</i>'+Math.floor(resources.crystal)+'</span>'+(base?'<span class="resource"><i>♥</i>'+Math.max(0,Math.ceil(base.hp))+'</span>':'');
  }
  function showToast(text){var el=document.getElementById("toast");el.textContent=text;el.classList.add("show");toastTimer=2.2;}

  function rayHit(){
    if(!terrainMesh)return null;raycaster.setFromCamera(mouse,camera);var hit=raycaster.intersectObject(terrainMesh,false);return hit[0]||null;
  }
  function sandboxAction(place){
    var h=rayHit();if(!h)return;var p=h.point.clone().add(h.face.normal.clone().multiplyScalar(place?.04:-.04));
    var x=Math.floor(p.x),y=Math.floor(p.y),z=Math.floor(p.z);if(!inside(x,y,z))return;
    if(place){if(get(x,y,z)!==AIR)return;set(x,y,z,selectedBlock);}else{if(get(x,y,z)===AIR)return;set(x,y,z,AIR);}
    worldDirty=true;
  }
  function placeBuilding(){
    if(!selectedBuild)return;var h=rayHit();if(!h)return;var p=h.point,x=Math.floor(p.x),z=Math.floor(p.z),y=topAt(x,z);
    if(y<2||Math.hypot(playerState.x-x,playerState.z-z)>11){showToast("Build closer to your commander.");return;}
    var cost=BUILD_COST[selectedBuild];if(resources.wood<cost.wood||resources.stone<cost.stone){showToast("Not enough resources.");return;}
    if(buildings.some(function(b){return Math.hypot(b.x-x,b.z-z)<3;})||bases.some(function(b){return Math.hypot(b.x-x,b.z-z)<4;})){showToast("That ground is occupied.");return;}
    resources.wood-=cost.wood;resources.stone-=cost.stone;
    buildings.push({kind:selectedBuild,faction:playerFaction,x:x,z:z,mesh:structure(selectedBuild,playerFaction,x,z),timer:2.5});
    showToast(selectedBuild.toUpperCase()+" constructed");updateResources();
  }
  function setRally(){
    var h=rayHit();if(!h)return;rally={x:h.point.x,z:h.point.z};
    if(!hoverGhost)return;hoverGhost.material.color.setHex(FACTIONS[playerFaction].accent);showToast("Army rally point set");
  }

  function updateHover(){
    if(mode==="menu"||paused){hoverGhost.visible=false;return;}var h=rayHit();if(!h){hoverGhost.visible=false;return;}
    var p=h.point.clone().add(h.face.normal.clone().multiplyScalar(mode==="sandbox"?.04:.01));
    var x=Math.floor(p.x),z=Math.floor(p.z),y=mode==="sandbox"?Math.floor(p.y):topAt(x,z);
    hoverGhost.position.set(x+.5,y+1.01,z+.5);hoverGhost.scale.set(mode==="strategy"&&selectedBuild?3:1,.04,mode==="strategy"&&selectedBuild?3:1);
    hoverGhost.material.color.setHex(mode==="strategy"?FACTIONS[playerFaction].accent:0xffe36b);hoverGhost.visible=true;
  }
  function updatePlayer(dt){
    var mx=(keys.d||keys.arrowright?1:0)-(keys.a||keys.arrowleft?1:0)+mobileMove.x;
    var mz=(keys.s||keys.arrowdown?1:0)-(keys.w||keys.arrowup?1:0)+mobileMove.y;
    var len=Math.hypot(mx,mz);if(len>1){mx/=len;mz/=len;}
    var yaw=Math.atan2(camera.position.x-controls.target.x,camera.position.z-controls.target.z),sn=Math.sin(yaw),cs=Math.cos(yaw);
    var dx=mx*cs+mz*sn,dz=-mx*sn+mz*cs,speed=keys.shift?7.2:4.5;
    playerState.vx+=(dx*speed-playerState.vx)*Math.min(1,dt*10);playerState.vz+=(dz*speed-playerState.vz)*Math.min(1,dt*10);
    if(!len){playerState.vx*=Math.pow(.001,dt);playerState.vz*=Math.pow(.001,dt);}
    playerState.coyote=playerState.grounded?.12:Math.max(0,playerState.coyote-dt);
    playerState.jumpBuffer=Math.max(0,playerState.jumpBuffer-dt);
    if(playerState.jumpBuffer>0&&playerState.coyote>0){playerState.vy=7.8;playerState.grounded=false;playerState.coyote=0;playerState.jumpBuffer=0;}
    playerState.vy-=20*dt;
    var nx=playerState.x+playerState.vx*dt,nz=playerState.z+playerState.vz*dt,current=topAt(playerState.x,playerState.z),next=topAt(nx,nz);
    if(next>=0&&next<=current+1){playerState.x=nx;playerState.z=nz;if(next===current+1&&playerState.grounded)playerState.y=next+1.01;}
    else{playerState.vx*=.2;playerState.vz*=.2;}
    playerState.y+=playerState.vy*dt;var floor=topAt(playerState.x,playerState.z)+1.01;
    if(playerState.y<=floor){playerState.y=floor;playerState.vy=0;playerState.grounded=true;}else playerState.grounded=false;
    if(playerState.y<-8)resetPlayer(W/2,D/2);
    player.position.set(playerState.x+.5,playerState.y,playerState.z+.5);
    if(len){
      player.rotation.y=Math.atan2(dx,dz);var ud=player.userData;ud.walk+=dt*10;var swing=Math.sin(ud.walk)*.65;
      ud.legs[0].rotation.x=swing;ud.legs[1].rotation.x=-swing;ud.arms[0].rotation.x=-swing;ud.arms[1].rotation.x=swing;
    }
    var desired=new THREE.Vector3(player.position.x,player.position.y+.7,player.position.z),follow=desired.clone().sub(controls.target).multiplyScalar(Math.min(1,dt*7));
    controls.target.add(follow);camera.position.add(follow);
  }

  function showGame(nextMode){
    mode=nextMode;paused=false;document.body.classList.remove("menu-mode");document.getElementById("menu").classList.add("hidden");document.getElementById("pause").classList.add("hidden");
    document.getElementById("sandboxHud").classList.toggle("hidden",mode!=="sandbox");
    document.getElementById("crosshair").classList.toggle("hidden",mode!=="sandbox");
    document.getElementById("strategyPanel").classList.toggle("hidden",mode!=="strategy");
    document.getElementById("resourceHud").classList.toggle("hidden",mode!=="strategy");
    document.getElementById("modeLabel").textContent=mode==="strategy"?"ISLES AT WAR":"ISLAND SANDBOX";
    document.getElementById("mobileControls").classList.toggle("hidden",!("ontouchstart" in window));
    player.visible=true;controls.enablePan=false;controls.enabled=true;
  }
  function startSandbox(){
    clearStrategy();generateSandbox();buildTerrainMesh();showGame("sandbox");resetPlayer(29,29);camera.position.set(45,29,45);controls.target.set(29,7,29);
  }
  function startStrategy(faction){
    generateStrategy();buildTerrainMesh();showGame("strategy");initStrategy(faction);
    camera.position.set(player.position.x+20,player.position.y+24,player.position.z+20);controls.target.set(player.position.x,player.position.y,player.position.z);
  }
  function showMenu(){
    paused=false;mode="menu";document.body.classList.add("menu-mode");document.getElementById("menu").classList.remove("hidden");document.querySelector(".menu-copy").classList.remove("hidden");document.getElementById("factionPicker").classList.add("hidden");
    document.getElementById("pause").classList.add("hidden");document.getElementById("sandboxHud").classList.add("hidden");document.getElementById("strategyPanel").classList.add("hidden");document.getElementById("resourceHud").classList.add("hidden");document.getElementById("crosshair").classList.add("hidden");document.getElementById("mobileControls").classList.add("hidden");
    player.visible=false;hoverGhost.visible=false;generateSandbox();buildTerrainMesh();controls.target.set(29,5,29);camera.position.set(49,25,49);
  }
  function togglePause(force){
    if(mode==="menu")return;paused=force!==undefined?force:!paused;document.getElementById("pause").classList.toggle("hidden",!paused);controls.enabled=!paused;
  }

  function bindUI(){
    document.getElementById("playSandbox").addEventListener("click",startSandbox);
    document.getElementById("showFactions").addEventListener("click",function(){document.querySelector(".menu-copy").classList.add("hidden");document.getElementById("factionPicker").classList.remove("hidden");});
    document.getElementById("backToMenu").addEventListener("click",function(){document.querySelector(".menu-copy").classList.remove("hidden");document.getElementById("factionPicker").classList.add("hidden");});
    document.querySelectorAll(".faction").forEach(function(el){el.addEventListener("click",function(){startStrategy(el.dataset.faction);});});
    document.getElementById("menuButton").addEventListener("click",function(){togglePause();});
    document.getElementById("resume").addEventListener("click",function(){togglePause(false);});
    document.getElementById("exitMenu").addEventListener("click",showMenu);
    document.querySelectorAll(".build-card").forEach(function(el){el.addEventListener("click",function(){selectedBuild=selectedBuild===el.dataset.build?null:el.dataset.build;document.querySelectorAll(".build-card").forEach(function(b){b.classList.toggle("active",b.dataset.build===selectedBuild);});});});
    window.addEventListener("keydown",function(e){
      var k=e.key.toLowerCase();keys[k]=true;if(e.code==="Space"){playerState.jumpBuffer=.14;e.preventDefault();}
      if(k==="escape")togglePause();if(mode==="sandbox"&&k>="1"&&k<="9")selectBlock(HOTBAR[Number(k)-1]);
    });
    window.addEventListener("keyup",function(e){keys[e.key.toLowerCase()]=false;});
    renderer.domElement.addEventListener("pointerdown",function(e){pointer.down={x:e.clientX,y:e.clientY,button:e.button};pointer.drag=false;});
    renderer.domElement.addEventListener("pointermove",function(e){
      var r=renderer.domElement.getBoundingClientRect();mouse.x=(e.clientX-r.left)/r.width*2-1;mouse.y=-(e.clientY-r.top)/r.height*2+1;
      if(pointer.down&&Math.hypot(e.clientX-pointer.down.x,e.clientY-pointer.down.y)>6)pointer.drag=true;
    });
    window.addEventListener("pointerup",function(e){
      if(!pointer.down||pointer.drag||paused){pointer.down=null;return;}var button=pointer.down.button;pointer.down=null;
      if(mode==="sandbox")sandboxAction(button===2);else if(mode==="strategy"){if(button===2)setRally();else if(button===0&&selectedBuild)placeBuilding();}
    });
    window.addEventListener("contextmenu",function(e){e.preventDefault();});
    var stick=document.getElementById("moveStick"),nub=stick.querySelector("i");
    function stickMove(e){var t=e.touches?e.touches[0]:e,r=stick.getBoundingClientRect(),x=(t.clientX-r.left-r.width/2)/(r.width*.36),y=(t.clientY-r.top-r.height/2)/(r.height*.36),l=Math.max(1,Math.hypot(x,y));mobileMove.x=x/l;mobileMove.y=y/l;nub.style.transform="translate("+(mobileMove.x*28)+"px,"+(mobileMove.y*28)+"px)";}
    stick.addEventListener("touchstart",stickMove,{passive:false});stick.addEventListener("touchmove",stickMove,{passive:false});stick.addEventListener("touchend",function(){mobileMove.x=mobileMove.y=0;nub.style.transform="";});
    document.getElementById("mobileJump").addEventListener("touchstart",function(e){e.preventDefault();playerState.jumpBuffer=.14;},{passive:false});
  }

  function init(){
    atlasInfo=buildAtlas();scene=new THREE.Scene();scene.background=new THREE.Color(0x78bfe2);scene.fog=new THREE.Fog(0x91c9df,48,105);
    camera=new THREE.OrthographicCamera(-18,18,18,-18,.1,240);camera.position.set(49,25,49);
    renderer=new THREE.WebGLRenderer({antialias:false,powerPreference:"high-performance"});renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.setSize(innerWidth,innerHeight);
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;if("outputEncoding" in renderer)renderer.outputEncoding=THREE.sRGBEncoding;
    document.getElementById("game").appendChild(renderer.domElement);
    controls=new THREE.OrbitControls(camera,renderer.domElement);controls.target.set(29,5,29);controls.enableDamping=true;controls.dampingFactor=.1;controls.enablePan=false;controls.minZoom=.62;controls.maxZoom=2.2;controls.maxPolarAngle=Math.PI/2-.12;controls.minPolarAngle=.35;
    controls.mouseButtons={LEFT:THREE.MOUSE.ROTATE,MIDDLE:THREE.MOUSE.PAN,RIGHT:THREE.MOUSE.ROTATE};
    scene.add(new THREE.HemisphereLight(0xdff2ff,0x40592f,.78));var sun=new THREE.DirectionalLight(0xffedbd,1.05);sun.position.set(34,52,26);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-42;sun.shadow.camera.right=42;sun.shadow.camera.top=42;sun.shadow.camera.bottom=-42;sun.shadow.bias=-.0005;scene.add(sun);
    ocean=new THREE.Mesh(new THREE.PlaneGeometry(180,180),new THREE.MeshPhongMaterial({color:0x348db5,shininess:70,transparent:true,opacity:.88}));ocean.rotation.x=-Math.PI/2;ocean.position.set(W/2,1.15,D/2);scene.add(ocean);
    var ghostGeo=new THREE.BoxGeometry(1.03,.08,1.03),ghostMat=new THREE.MeshBasicMaterial({color:0xffe36b,transparent:true,opacity:.72,wireframe:true});hoverGhost=new THREE.Mesh(ghostGeo,ghostMat);hoverGhost.visible=false;scene.add(hoverGhost);
    createPlayer();generateSandbox();buildTerrainMesh();buildHotbar();bindUI();showMenu();
    window.addEventListener("resize",function(){var aspect=innerWidth/innerHeight,d=18;camera.left=-d*aspect;camera.right=d*aspect;camera.top=d;camera.bottom=-d;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
    requestAnimationFrame(loop);
  }
  function loop(now){
    requestAnimationFrame(loop);var dt=Math.min((now-last)/1000,.05);last=now;
    if(!paused){
      if(mode==="menu"){menuAngle+=dt*.13;camera.position.x=29+Math.cos(menuAngle)*34;camera.position.z=29+Math.sin(menuAngle)*34;camera.position.y=24+Math.sin(menuAngle*.7)*2;}
      else updatePlayer(dt);
      if(mode==="strategy"){strategyAccumulator+=dt;while(strategyAccumulator>=.1){strategyTick(.1);strategyAccumulator-=.1;}}
      if(worldDirty)buildTerrainMesh();updateHover();renderUnits(now);
      ocean.material.opacity=.84+Math.sin(now*.0012)*.035;
      if(toastTimer>0){toastTimer-=dt;if(toastTimer<=0)document.getElementById("toast").classList.remove("show");}
    }
    controls.update();renderer.render(scene,camera);
  }
  init();
})();
