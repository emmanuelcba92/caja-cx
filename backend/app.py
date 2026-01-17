from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
import os

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

# Database configuration
db_path = os.path.join(os.path.abspath(os.path.dirname(__file__)), 'caja_v3.db')
app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{db_path}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

# Models
class Profesional(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(100), unique=True, nullable=False)
    categoria = db.Column(db.String(50), default='ORL') # ORL, Anestesista, Estetica
    # Cascade delete entries if professional is deleted (optional, but safer to keep history or set null)
    # For now we will set to NULL if professional is deleted to keep financial record
    
class CajaDiaria(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    fecha = db.Column(db.Date, default=datetime.utcnow, nullable=False)
    paciente = db.Column(db.String(100), nullable=False)
    dni = db.Column(db.String(20), nullable=False)
    obra_social = db.Column(db.String(100))
    
    prof_1_id = db.Column(db.Integer, db.ForeignKey('profesional.id'))
    prof_2_id = db.Column(db.Integer, db.ForeignKey('profesional.id'))
    anestesista_id = db.Column(db.Integer, db.ForeignKey('profesional.id'))
    
    monto_pesos = db.Column(db.Float, default=0.0)
    monto_dolares = db.Column(db.Float, default=0.0)
    
    liq_prof_1 = db.Column(db.Float, default=0.0)
    liq_prof_1_currency = db.Column(db.String(10), default='ARS')
    
    liq_prof_2 = db.Column(db.Float, default=0.0)
    liq_prof_2_currency = db.Column(db.String(10), default='ARS')
    
    liq_anestesista = db.Column(db.Float, default=0.0)
    liq_anestesista_currency = db.Column(db.String(10), default='ARS')
    
    coat_pesos = db.Column(db.Float, default=0.0)
    coat_dolares = db.Column(db.Float, default=0.0)
    
    comentario = db.Column(db.String(255))

    prof_1 = db.relationship('Profesional', foreign_keys=[prof_1_id], backref='entradas_como_1')
    prof_2 = db.relationship('Profesional', foreign_keys=[prof_2_id], backref='entradas_como_2')
    anestesista_rel = db.relationship('Profesional', foreign_keys=[anestesista_id], backref='entradas_como_anest')

class AppConfig(db.Model):
    key = db.Column(db.String(50), primary_key=True)
    value = db.Column(db.String(200), nullable=False)

class DailyComment(db.Model):
    date = db.Column(db.String(10), primary_key=True)
    comment = db.Column(db.Text)

with app.app_context():
    db.create_all()

@app.route('/profesionales', methods=['GET', 'POST'])
def handle_profesionales():
    if request.method == 'POST':
        data = request.json
        try:
            prof = Profesional(nombre=data['nombre'], categoria=data.get('categoria', 'ORL'))
            db.session.add(prof)
            db.session.commit()
            return jsonify({"status": "success", "id": prof.id, "nombre": prof.nombre}), 201
        except Exception as e:
            return jsonify({"status": "error", "message": str(e)}), 400
    profs = Profesional.query.all()
    return jsonify([{"id": p.id, "nombre": p.nombre, "categoria": p.categoria} for p in profs])

@app.route('/profesionales/<int:id>', methods=['DELETE'])
def delete_profesional(id):
    try:
        prof = Profesional.query.get(id)
        if not prof:
            return jsonify({"status": "error", "message": "Profesional no encontrado"}), 404
        db.session.delete(prof)
        db.session.commit()
        return jsonify({"status": "success", "message": "Profesional eliminado"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 400

@app.route('/guardar-caja', methods=['POST'])
def guardar_caja():
    data = request.json
    try:
        # We process entries. Note: Ideally strict validation.
        # Current logic: Create NEW entries. 
        # (TODO: Future improvement - support editing existing IDs if sent)
        
        for entry in data['entries']:
            # Resolve IDs from names if passed, or use IDs directly if passed.
            # Frontend should send names or IDs. Let's assume frontend sends IDs for dropdowns or Handles name lookup.
            # To be safe and consistent with previous logic, let's allow finding by unique name for Prof 1/2 if needed, 
            # BUT for Anesthetist it's now a dropdown so we likely get ID or Name. 
            # Let's handle lookup by Name for robustness as frontend might send names.
            
            def get_prof_id(name):
                if not name: return None
                p = Profesional.query.filter_by(nombre=name).first()
                return p.id if p else None

            prof1_id = get_prof_id(entry.get('prof_1'))
            prof2_id = get_prof_id(entry.get('prof_2'))
            anest_id = get_prof_id(entry.get('anestesista')) # Now expects a name from dropdown
            
            nueva_entrada = CajaDiaria(
                fecha=datetime.strptime(entry.get('fecha'), '%Y-%m-%d').date() if entry.get('fecha') else datetime.utcnow().date(),
                paciente=entry.get('paciente', ''),
                dni=entry.get('dni', ''),
                obra_social=entry.get('obra_social', ''),
                prof_1_id=prof1_id,
                prof_2_id=prof2_id,
                anestesista_id=anest_id,
                monto_pesos=entry.get('pesos', 0),
                monto_dolares=entry.get('dolares', 0),
                
                liq_prof_1=entry.get('liq_prof_1', 0),
                liq_prof_1_currency=entry.get('liq_prof_1_currency', 'ARS'),
                
                liq_prof_2=entry.get('liq_prof_2', 0),
                liq_prof_2_currency=entry.get('liq_prof_2_currency', 'ARS'),
                
                liq_anestesista=entry.get('liq_anestesista', 0),
                liq_anestesista_currency=entry.get('liq_anestesista_currency', 'ARS'),
                
                coat_pesos=entry.get('coat_pesos', 0),
                coat_dolares=entry.get('coat_dolares', 0),
                comentario=entry.get('comentario', '')
            )
            db.session.add(nueva_entrada)
        db.session.commit()
        return jsonify({"status": "success", "message": "Caja guardada correctamente"}), 201
    except Exception as e:
        print(f"Error: {e}")
        return jsonify({"status": "error", "message": str(e)}), 400

@app.route('/liquidacion/<profesional>', methods=['GET'])
def get_liquidacion(profesional):
    role = request.args.get('role', '1') # '1', '2'
    
    prof = Profesional.query.filter_by(nombre=profesional).first()
    if not prof:
        return jsonify({"status": "error", "message": "Profesional no encontrado"}), 404
    
    # Logic: 
    # If category is 'Anestesista', we look for them in 'anestesista_id' column
    # If category is 'Estetica', we look for them in 'prof_2_id' (usually) or respect role? 
    # User said "lo mismo estética, utilizará liquidación 2". This likely means they are in Prof 2 slot and use Model 2.
    

    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')

    # Combined Query: Check if professional is in ANY of the 3 slots
    query = CajaDiaria.query.filter(
        (CajaDiaria.prof_1_id == prof.id) | 
        (CajaDiaria.prof_2_id == prof.id) | 
        (CajaDiaria.anestesista_id == prof.id)
    )

    if start_date:
        query = query.filter(CajaDiaria.fecha >= datetime.strptime(start_date, '%Y-%m-%d').date())
    if end_date:
        query = query.filter(CajaDiaria.fecha <= datetime.strptime(end_date, '%Y-%m-%d').date())

    entries = query.order_by(CajaDiaria.fecha.asc()).all()

    data_entries = []
    total_pesos = 0
    total_dolares = 0

    for e in entries:
        # Determine which role they played in this specific entry to get the correct liquidation amount
        liq_amount = 0
        liq_currency = 'ARS'

        if e.prof_1_id == prof.id:
            liq_amount = e.liq_prof_1
            liq_currency = e.liq_prof_1_currency
        elif e.prof_2_id == prof.id:
            liq_amount = e.liq_prof_2
            liq_currency = e.liq_prof_2_currency
        elif e.anestesista_id == prof.id:
            liq_amount = e.liq_anestesista
            liq_currency = e.liq_anestesista_currency

        if liq_currency == 'USD':
            total_dolares += (liq_amount or 0)
        else:
            total_pesos += (liq_amount or 0)
            
        # Get patient payment amount for context (Model 1)
        # Note: We display the full patient payment, regardless of who receives it, as per previous logic?
        # Or should we only show relevant payment? Usually full payment is shown for context.
        # But 'cobro' columns are unique per entry, not per professional.
        
        data_entries.append({
            "id": e.id,
            "fecha": e.fecha.strftime('%d/%m/%Y'),
            "paciente": e.paciente,
            "dni": e.dni or '',
            "obra_social": e.obra_social or '',
            "pago_pesos": e.monto_pesos,
            "pago_dolares": e.monto_dolares,
            "liq_amount": liq_amount or 0,
            "liq_currency": liq_currency or 'ARS'
        })

    return jsonify({
        "profesional": prof.nombre,
        "categoria": prof.categoria,
        "entradas": data_entries,
        "totales": {
            "liq_pesos": total_pesos,
            "liq_dolares": total_dolares
        }
    })

# --- New Endpoints for History (CRUD) ---

@app.route('/caja', methods=['GET'])
def get_caja_history():
    date_str = request.args.get('date')
    query = CajaDiaria.query
    
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')

    if date_str:
        try:
            target_date = datetime.strptime(date_str, '%Y-%m-%d').date()
            query = query.filter_by(fecha=target_date)
        except ValueError:
            pass
    elif start_date or end_date:
        if start_date:
            try:
                query = query.filter(CajaDiaria.fecha >= datetime.strptime(start_date, '%Y-%m-%d').date())
            except ValueError: pass
        if end_date:
            try:
                query = query.filter(CajaDiaria.fecha <= datetime.strptime(end_date, '%Y-%m-%d').date())
            except ValueError: pass
            
    # Exclude Manual Liquidations from History View unless requested
    include_manual = request.args.get('include_manual')
    if not include_manual:
        query = query.filter((CajaDiaria.comentario != 'Liquidación Manual') | (CajaDiaria.comentario == None))
        query = query.filter(~CajaDiaria.paciente.contains('(Liq. Manual)'))

    entradas = query.order_by(CajaDiaria.fecha.desc(), CajaDiaria.id.desc()).all()
    
    res = []
    for e in entradas:
        prof1_name = e.prof_1.nombre if e.prof_1 else ''
        prof2_name = e.prof_2.nombre if e.prof_2 else ''
        anest_name = e.anestesista_rel.nombre if e.anestesista_rel else ''

        res.append({
            "id": e.id,
            "fecha": e.fecha.strftime("%Y-%m-%d"),
            "paciente": e.paciente,
            "dni": e.dni,
            "obra_social": e.obra_social,
            "prof_1": prof1_name,
            "prof_2": prof2_name,
            "anestesista": anest_name,
            "pesos": e.monto_pesos,
            "dolares": e.monto_dolares,
            "liq_prof_1": e.liq_prof_1,
            "liq_prof_1_currency": e.liq_prof_1_currency,
            "liq_prof_2": e.liq_prof_2,
            "liq_prof_2_currency": e.liq_prof_2_currency,
            "liq_anestesista": e.liq_anestesista,
            "liq_anestesista_currency": e.liq_anestesista_currency,
            "coat_pesos": e.coat_pesos,
            "coat_dolares": e.coat_dolares,
            "comentario": e.comentario
        })
    return jsonify(res)

@app.route('/caja/<int:id>', methods=['PUT'])
def update_caja_entry(id):
    data = request.json
    entry = CajaDiaria.query.get(id)
    if not entry:
        return jsonify({"status": "error", "message": "Entrada no encontrada"}), 404
    
    try:
        # Update fields
        if 'fecha' in data: entry.fecha = datetime.strptime(data['fecha'], '%Y-%m-%d').date()
        if 'paciente' in data: entry.paciente = data['paciente']
        if 'dni' in data: entry.dni = data['dni']
        if 'obra_social' in data: entry.obra_social = data['obra_social']
        if 'pesos' in data: entry.monto_pesos = data['pesos']
        if 'dolares' in data: entry.monto_dolares = data['dolares']
        if 'liq_prof_1' in data: entry.liq_prof_1 = data['liq_prof_1']
        if 'liq_prof_1_currency' in data: entry.liq_prof_1_currency = data['liq_prof_1_currency']
        if 'liq_prof_2' in data: entry.liq_prof_2 = data['liq_prof_2']
        if 'liq_prof_2_currency' in data: entry.liq_prof_2_currency = data['liq_prof_2_currency']
        if 'liq_anestesista' in data: entry.liq_anestesista = data['liq_anestesista']
        if 'liq_anestesista_currency' in data: entry.liq_anestesista_currency = data['liq_anestesista_currency']
        if 'coat_pesos' in data: entry.coat_pesos = data['coat_pesos']
        if 'coat_dolares' in data: entry.coat_dolares = data['coat_dolares']
        if 'comentario' in data: entry.comentario = data['comentario']

        # Relationships (Prof 1, Prof 2, Anest)
        # We expect Names to be sent back (or IDs). Let's handle Names as that's what we send in GET.
        def update_prof_rel(name_field, id_field):
            if name_field in data:
                name = data[name_field]
                if not name:
                    setattr(entry, id_field, None)
                else:
                    p = Profesional.query.filter_by(nombre=name).first()
                    # If prof doesn't exist, maybe create or error? Let's error or ignore. 
                    # Ideally user selects from list.
                    if p: setattr(entry, id_field, p.id)

        update_prof_rel('prof_1', 'prof_1_id')
        update_prof_rel('prof_2', 'prof_2_id')
        update_prof_rel('anestesista', 'anestesista_id')

        db.session.commit()
        return jsonify({"status": "success", "message": "Entrada actualizada"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 400

@app.route('/caja/<int:id>', methods=['DELETE'])
def delete_caja_entry(id):
    try:
        entry = CajaDiaria.query.get(id)
        if not entry:
            return jsonify({"status": "error", "message": "Entrada no encontrada"}), 404
        db.session.delete(entry)
        db.session.commit()
        return jsonify({"status": "success", "message": "Entrada eliminada"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 400

@app.route('/caja/dia/<string:date_str>', methods=['DELETE'])
def delete_caja_day(date_str):
    try:
        date_obj = datetime.strptime(date_str, '%Y-%m-%d').date()
        # Delete entries
        num_deleted = CajaDiaria.query.filter_by(fecha=date_obj).delete()
        
        # Also delete the daily comment for that date logic if it exists separately
        DailyComment.query.filter_by(date=date_str).delete()

        db.session.commit()
        return jsonify({"status": "success", "message": f"Día eliminado ({num_deleted} entradas)"}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"status": "error", "message": str(e)}), 400

# --- CONFIG & DAILY COMMENT ---

@app.route('/config/pin', methods=['GET', 'POST'])
def handle_pin():
    if request.method == 'POST':
        data = request.json
        new_pin = data.get('pin')
        pin_config = AppConfig.query.get('admin_pin')
        if not pin_config:
            pin_config = AppConfig(key='admin_pin', value=new_pin)
            db.session.add(pin_config)
        else:
            pin_config.value = new_pin
        db.session.commit()
        return jsonify({'message': 'PIN actualizado'}), 200
    else:
        pin_config = AppConfig.query.get('admin_pin')
        return jsonify({'pin': pin_config.value if pin_config else '1234'}), 200

@app.route('/daily-comment/<date>', methods=['GET'])
def get_daily_comment(date):
    comment = DailyComment.query.get(date)
    return jsonify({'comment': comment.comment if comment else ''}), 200

@app.route('/daily-comment', methods=['POST'])
def save_daily_comment():
    data = request.json
    date = data.get('date')
    text = data.get('comment')
    
    if not date:
        return jsonify({'message': 'Falta fecha'}), 400
        
    comment_entry = DailyComment.query.get(date)
    if not comment_entry:
        comment_entry = DailyComment(date=date, comment=text)
        db.session.add(comment_entry)
    else:
        comment_entry.comment = text
    
    db.session.commit()
    return jsonify({'message': 'Comentario guardado'}), 200

def init_defaults():
    with app.app_context():
        # Ensure default PIN exists
        if not AppConfig.query.get('admin_pin'):
            db.session.add(AppConfig(key='admin_pin', value='1234'))
            db.session.commit()

init_defaults()

if __name__ == '__main__':
    app.run(host='0.0.0.0', debug=True, port=5000)
