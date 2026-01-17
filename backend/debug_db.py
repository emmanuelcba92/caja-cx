from app import app, db, CajaDiaria, Profesional

with app.app_context():
    # Find the entry
    entry = CajaDiaria.query.filter_by(paciente="Silvia Bustamante").first()
    if entry:
        print(f"Entry ID: {entry.id}")
        print(f"Fecha: {entry.fecha}")
        print(f"Prof 1 ID: {entry.prof_1_id}")
        print(f"Prof 2 ID: {entry.prof_2_id}")
        print(f"Anestesista ID: {entry.anestesista_id}")
        
        p1 = Profesional.query.get(entry.prof_1_id) if entry.prof_1_id else None
        p2 = Profesional.query.get(entry.prof_2_id) if entry.prof_2_id else None
        anest = Profesional.query.get(entry.anestesista_id) if entry.anestesista_id else None
        
        print(f"Prof 1 Name: {p1.nombre if p1 else 'None'}")
        print(f"Prof 2 Name: {p2.nombre if p2 else 'None'}")
        print(f"Anest Name: {anest.nombre if anest else 'None'}")
    else:
        print("Entry not found")

    print("-" * 20)
    print("All Professionals:")
    profs = Profesional.query.all()
    for p in profs:
        print(f"ID: {p.id}, Name: '{p.nombre}', Category: '{p.categoria}'")
